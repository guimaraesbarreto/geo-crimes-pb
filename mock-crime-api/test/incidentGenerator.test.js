const test = require('node:test');
const assert = require('node:assert/strict');
const {
  generateOffenderCount,
  dailyIncidentRates,
  generateIncidentType,
  generateRandomIncident,
  generateVictimCount,
  getIncidentsPerHour,
  paraibaLocations,
  shouldGenerateIncidentNow
} = require('../src/incidentGenerator');

test('generates incidents with a city, neighborhood, street, and state', () => {
  const incident = generateRandomIncident({ occurrenceDate: new Date('2026-01-01T12:00:00Z') });

  assert.ok(paraibaLocations.length > 1);
  assert.ok(paraibaLocations.some((location) => location.city === incident.city));
  assert.equal(incident.state, 'PB');
  assert.ok(incident.neighborhood);
  assert.ok(incident.street);
  assert.match(incident.address, new RegExp(`${incident.city} - PB$`));
  assert.ok(dailyIncidentRates.some(({ type }) => type === incident.type));
});

test('generates crime categories in proportion to the supplied daily rates', () => {
  const sampleSize = 100000;
  const typeCounts = new Map();
  for (let index = 0; index < sampleSize; index++) {
    const type = generateIncidentType(() => index / sampleSize);
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
  }

  for (const { type, incidentsPerDay } of dailyIncidentRates) {
    const expectedCount = sampleSize * incidentsPerDay / 62.3;
    assert.ok(Math.abs(typeCounts.get(type) - expectedCount) < 1);
  }
});

test('generates valid counts and favors small groups', () => {
  const victims = Array.from({ length: 1000 }, (_, index) => generateVictimCount(() => index / 1000));
  const offenders = Array.from({ length: 1000 }, (_, index) => generateOffenderCount(() => index / 1000));

  for (let index = 0; index < 1000; index++) {
    const incident = generateRandomIncident();
    assert.ok(incident.victimCount >= 1 && incident.victimCount <= 5);
    assert.ok(incident.offenderCount >= 1 && incident.offenderCount <= 4);
  }

  assert.equal(victims.filter((count) => count <= 3).length, 900);
  assert.equal(offenders.filter((count) => count === 1).length, 820);
  assert.equal(generateVictimCount(() => 0.99), 5);
  assert.equal(generateOffenderCount(() => 0.99), 4);
  assert.equal(generateOffenderCount(() => 0.5), 1);
});

test('uses a higher generation rate at night through 4 a.m.', () => {
  const expectedRate = (weight) => 62.3 / 34.5 * weight;
  const assertHourlyRate = (hour, weight) => {
    assert.ok(Math.abs(getIncidentsPerHour(hour) - expectedRate(weight)) < 1e-12);
  };
  assertHourlyRate(23, 3);
  assertHourlyRate(2, 3);
  assertHourlyRate(4, 1);
  assertHourlyRate(5, 1);
  assertHourlyRate(12, 0.5);
  assertHourlyRate(16, 0.5);
  assertHourlyRate(19, 2);
  assertHourlyRate(7, 0.5);

  const night = new Date('2026-01-01T02:00:00-03:00');
  assert.equal(shouldGenerateIncidentNow(night, () => 0.05), true);
  assert.equal(shouldGenerateIncidentNow(night, () => 0.1), false);
});

test('scales the hourly probabilities to an expected 62.3 incidents per day', () => {
  const expectedDailyCount = Array.from({ length: 24 }, (_, hour) =>
    getIncidentsPerHour(hour)
  ).reduce((total, rate) => total + rate, 0);

  assert.ok(Math.abs(expectedDailyCount - 62.3) < 1e-10);
});
