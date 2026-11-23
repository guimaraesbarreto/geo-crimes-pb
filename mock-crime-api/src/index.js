const express = require('express');
const mongoose = require('mongoose');
const cron = require('node-cron');
const { migrateLegacyIncidents } = require('./migrateData');
const {
  generateRandomIncident,
  shouldGenerateIncidentNow
} = require('./incidentGenerator');
const Incident = require('./Incident');

const app = express();
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ssp_mock';

function buildFilter(query) {
  const type = readText(query, 'type');
  const city = readText(query, 'city');
  const neighborhood = readText(query, 'neighborhood');
  const { startDate, endDate } = query;
  const filter = {};
  if (type) filter.type = type;
  if (city) filter.city = city;
  if (neighborhood) filter.neighborhood = neighborhood;
  if (startDate || endDate) {
    filter.occurredAt = {};
    if (startDate) {
      if (typeof startDate !== 'string') {
        throw Object.assign(new Error('startDate must be a valid date.'), { status: 400 });
      }
      filter.occurredAt.$gte = new Date(startDate);
      if (Number.isNaN(filter.occurredAt.$gte.getTime())) {
        throw Object.assign(new Error('startDate must be a valid date.'), { status: 400 });
      }
    }
    if (endDate) {
      if (typeof endDate !== 'string') {
        throw Object.assign(new Error('endDate must be a valid date.'), { status: 400 });
      }
      filter.occurredAt.$lte = new Date(endDate);
      if (Number.isNaN(filter.occurredAt.$lte.getTime())) {
        throw Object.assign(new Error('endDate must be a valid date.'), { status: 400 });
      }
    }
    if (
      filter.occurredAt.$gte
      && filter.occurredAt.$lte
      && filter.occurredAt.$gte > filter.occurredAt.$lte
    ) {
      throw Object.assign(new Error('startDate cannot be later than endDate.'), { status: 400 });
    }
  }
  return filter;
}

function readInteger(query, name, defaultValue, minimum, maximum) {
  const value = query[name] ?? defaultValue;
  if (!/^\d+$/.test(String(value))) {
    throw Object.assign(new Error(`${name} must be an integer.`), { status: 400 });
  }
  const number = Number(value);
  if (number < minimum || number > maximum) {
    throw Object.assign(new Error(`${name} must be between ${minimum} and ${maximum}.`), { status: 400 });
  }
  return number;
}

function readText(query, name, maximumLength = 100) {
  const value = query[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.length > maximumLength) {
    throw Object.assign(new Error(`${name} must be text with up to ${maximumLength} characters.`), { status: 400 });
  }
  return value.trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sendError(response, error) {
  if (error.status === 400) return response.status(400).json({ error: error.message });
  console.error('Request failed:', error);
  return response.status(500).json({ error: 'An internal error occurred while processing the request.' });
}

app.get('/api/incidents', async (request, response) => {
  try {
    const limit = readInteger(request.query, 'limit', 50, 1, 200);
    const page = readInteger(request.query, 'page', 1, 1, 1000000);
    const filter = buildFilter(request.query);
    const skip = (page - 1) * limit;

    const [incidents, total] = await Promise.all([
      Incident.find(filter).sort({ occurredAt: -1 }).skip(skip).limit(limit),
      Incident.countDocuments(filter)
    ]);

    response.json({ total, page, limit, data: incidents });
  } catch (error) {
    sendError(response, error);
  }
});

app.get('/api/incidents/search-address', async (request, response) => {
  try {
    const query = request.query.q;
    if (!query) return response.status(400).json({ error: 'Provide the search parameter ?q=' });
    if (typeof query !== 'string' || query.length > 100) {
      return response.status(400).json({ error: 'q must contain up to 100 characters.' });
    }
    const limit = readInteger(request.query, 'limit', 50, 1, 200);
    const filter = buildFilter(request.query);
    filter.address = { $regex: escapeRegex(query), $options: 'i' };

    const [incidents, total] = await Promise.all([
      Incident.find(filter).sort({ occurredAt: -1 }).limit(limit),
      Incident.countDocuments(filter)
    ]);
    response.json({ query, total, limit, data: incidents });
  } catch (error) {
    sendError(response, error);
  }
});

app.get('/api/incidents/critical-streets', async (request, response) => {
  try {
    const filter = buildFilter(request.query);
    const ranking = await Incident.aggregate([
      { $match: filter },
      { $sort: { occurredAt: -1 } },
      {
        $group: {
          _id: { city: '$city', neighborhood: '$neighborhood', street: '$street' },
          incidentCount: { $sum: 1 },
          victimCount: { $sum: '$victimCount' },
          offenderCount: { $sum: '$offenderCount' },
          incidentTypes: { $addToSet: '$type' },
          sampleAddresses: { $firstN: { input: '$address', n: 3 } }
        }
      },
      {
        $project: {
          _id: 0,
          city: '$_id.city',
          neighborhood: '$_id.neighborhood',
          street: '$_id.street',
          incidentCount: 1,
          victimCount: 1,
          offenderCount: 1,
          incidentTypes: 1,
          sampleAddresses: 1
        }
      },
      { $sort: { incidentCount: -1 } }
    ]);

    response.json(ranking);
  } catch (error) {
    sendError(response, error);
  }
});

app.get('/api/incidents/sync', async (request, response) => {
  try {
    const { since } = request.query;
    const limit = readInteger(request.query, 'limit', 100, 1, 500);
    const filter = {};
    if (since) {
      if (typeof since !== 'string') {
        return response.status(400).json({ error: 'since must be a valid date.' });
      }
      const date = new Date(since);
      if (Number.isNaN(date.getTime())) {
        return response.status(400).json({ error: 'since must be a valid date.' });
      }
      filter.createdAt = { $gt: date };
    }

    const incidents = await Incident.find(filter).sort({ createdAt: 1 }).limit(limit);
    response.json({
      count: incidents.length,
      lastTimestamp: incidents.length > 0 ? incidents[incidents.length - 1].createdAt : since || null,
      data: incidents
    });
  } catch (error) {
    sendError(response, error);
  }
});

app.get('/api/statistics', async (request, response) => {
  try {
    const filter = buildFilter(request.query);
    const statistics = await Incident.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { city: '$city', neighborhood: '$neighborhood', type: '$type' },
          count: { $sum: 1 },
          victimCount: { $sum: '$victimCount' },
          offenderCount: { $sum: '$offenderCount' }
        }
      },
      {
        $project: {
          _id: 0,
          city: '$_id.city',
          neighborhood: '$_id.neighborhood',
          type: '$_id.type',
          count: 1,
          victimCount: 1,
          offenderCount: 1
        }
      },
      { $sort: { count: -1 } }
    ]);
    response.json(statistics);
  } catch (error) {
    sendError(response, error);
  }
});

app.get('/api/statistics/daily-evolution', async (request, response) => {
  try {
    const filter = buildFilter(request.query);
    const evolution = await Incident.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            city: '$city',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$occurredAt', timezone: 'America/Fortaleza' } }
          },
          count: { $sum: 1 },
          victimCount: { $sum: '$victimCount' },
          offenderCount: { $sum: '$offenderCount' }
        }
      },
      {
        $project: {
          _id: 0,
          city: '$_id.city',
          date: '$_id.date',
          count: 1,
          victimCount: 1,
          offenderCount: 1
        }
      },
      { $sort: { date: 1, city: 1 } }
    ]);
    response.json(evolution);
  } catch (error) {
    sendError(response, error);
  }
});

const PORT = process.env.PORT || 3000;

async function start() {
  await mongoose.connect(MONGO_URI);
  await migrateLegacyIncidents(mongoose.connection.db);
  await Incident.createIndexes();
  console.log('Connected to MongoDB');

  const count = await Incident.countDocuments();
  if (count === 0) {
    console.log('Seeding 300 synthetic incidents...');
    await Incident.insertMany(Array.from({ length: 300 }, () => generateRandomIncident()));
    console.log('Initial data seeding completed.');
  }

  cron.schedule('* * * * *', async () => {
    if (!shouldGenerateIncidentNow()) return;
    try {
      const incident = generateRandomIncident({ occurrenceDate: new Date() });
      await Incident.create(incident);
      console.log(`[${new Date().toISOString()}] Synthetic incident recorded in ${incident.city}, PB.`);
    } catch (error) {
      console.error('Failed to generate synthetic incident:', error);
    }
  });

  app.listen(PORT, () => console.log(`Mock API listening on port ${PORT}`));
}

start().catch((error) => {
  console.error('Failed to start mock API:', error);
  process.exitCode = 1;
});
