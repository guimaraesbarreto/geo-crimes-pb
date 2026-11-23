const mongoose = require('mongoose');
const Incident = require('./Incident');
const { generateRandomIncident } = require('./incidentGenerator');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ssp_mock';
const CONFIRMATION = 'ssp_mock';
const INITIAL_INCIDENT_COUNT = 300;

async function seedDatabase() {
  const database = new URL(MONGO_URI).pathname.slice(1).split('?')[0];
  if (database !== CONFIRMATION || process.env.CONFIRM_MONGO_SEED !== CONFIRMATION) {
    throw new Error(
      `To seed only the ssp_mock database, set CONFIRM_MONGO_SEED=${CONFIRMATION} and use that database in MONGO_URI.`
    );
  }

  await mongoose.connect(MONGO_URI);
  try {
    const count = await Incident.countDocuments();
    if (count > 0) {
      throw new Error(`The database already contains ${count} incidents; no records were inserted.`);
    }

    await Incident.insertMany(
      Array.from({ length: INITIAL_INCIDENT_COUNT }, () => generateRandomIncident())
    );
    console.log(`Inserted ${INITIAL_INCIDENT_COUNT} synthetic incidents into ${database}.`);
  } finally {
    await mongoose.disconnect();
  }
}

seedDatabase().catch((err) => {
  console.error('Failed to seed the database:', err.message);
  process.exitCode = 1;
});
