const test = require('node:test');
const assert = require('node:assert/strict');
const { geocodeAddress } = require('../src/geocoder');

test('geocodes Paraiba cities without moving incidents to Joao Pessoa', () => {
  const points = [
    geocodeAddress('João Pessoa', 'Manaíra', 'Av. Edson Ramalho', 'Av. Edson Ramalho, 450, Manaíra, João Pessoa - PB'),
    geocodeAddress('Campina Grande', 'Centro', 'Rua Maciel Pinheiro', 'Rua Maciel Pinheiro, 450, Centro, Campina Grande - PB'),
    geocodeAddress('Patos', 'Centro', 'Rua Bossuet Wanderley', 'Rua Bossuet Wanderley, 450, Centro, Patos - PB')
  ];

  assert.ok(points.every(({ lon, lat }) => Number.isFinite(lon) && Number.isFinite(lat)));
  assert.ok(points[1].lon < -35.5);
  assert.ok(points[2].lon < -37);
  assert.ok(Math.abs(points[1].lon - points[0].lon) > 0.5);
});

test('uses neighborhoods for deterministic points and rejects unknown cities', () => {
  const first = geocodeAddress('Sousa', 'Centro', 'Rua Principal', 'Rua Principal, 100, Centro, Sousa - PB');
  const repeated = geocodeAddress('Sousa', 'Centro', 'Rua Principal', 'Rua Principal, 100, Centro, Sousa - PB');
  const anotherNeighborhood = geocodeAddress('Sousa', 'Estação', 'Rua Principal', 'Rua Principal, 100, Estação, Sousa - PB');

  assert.deepEqual(first, repeated);
  assert.notDeepEqual(first, anotherNeighborhood);
  assert.throws(
    () => geocodeAddress('Unknown city', 'Centro', 'Rua', 'Rua, 1, Centro'),
    /No coordinates registered/
  );
});

test('registers coordinates for every city supported by the mock API', () => {
  const cities = [
    'João Pessoa', 'Campina Grande', 'Santa Rita', 'Patos', 'Bayeux',
    'Cabedelo', 'Sousa', 'Cajazeiras', 'Guarabira', 'Sapé', 'Monteiro',
    'Pombal', 'Mamanguape', 'Itabaiana', 'Areia'
  ];

  for (const city of cities) {
    const point = geocodeAddress(city, 'Centro', 'Rua Principal', `Rua Principal, 100, Centro, ${city} - PB`);
    assert.ok(point.lon >= -39 && point.lon <= -34);
    assert.ok(point.lat >= -8 && point.lat <= -6);
  }
});
