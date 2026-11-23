const test = require('node:test');
const assert = require('node:assert/strict');
const {
  generateOffenderCount,
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
  assert.ok(['Theft', 'Street Robbery', 'Vehicle Theft', 'Vandalism', 'Commercial Robbery'].includes(incident.type));
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
  const expectedRate = (weight) => 500 / 34.5 * weight;
  assert.equal(getIncidentsPerHour(23), expectedRate(3));
  assert.equal(getIncidentsPerHour(2), expectedRate(3));
  assert.equal(getIncidentsPerHour(4), expectedRate(1));
  assert.equal(getIncidentsPerHour(5), expectedRate(1));
  assert.equal(getIncidentsPerHour(12), expectedRate(0.5));
  assert.equal(getIncidentsPerHour(16), expectedRate(0.5));
  assert.equal(getIncidentsPerHour(19), expectedRate(2));
  assert.equal(getIncidentsPerHour(7), expectedRate(0.5));

  const night = new Date('2026-01-01T02:00:00-03:00');
  assert.equal(shouldGenerateIncidentNow(night, () => 0.7), true);
  assert.equal(shouldGenerateIncidentNow(night, () => 0.8), false);
});

test('scales the hourly probabilities to an expected 500 incidents per day', () => {
  const expectedDailyCount = Array.from({ length: 24 }, (_, hour) =>
    getIncidentsPerHour(hour)
  ).reduce((total, rate) => total + rate, 0);

  assert.ok(Math.abs(expectedDailyCount - 500) < 1e-10);
});
