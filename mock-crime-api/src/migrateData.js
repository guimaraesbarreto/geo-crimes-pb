const legacyFieldNames = [
  'tipo',
  'cidade',
  'estado',
  'bairro',
  'rua',
  'endereco',
  'numeroVitimas',
  'numeroCriminosos',
  'dataOcorrencia',
  'criadoEm'
];

async function moveLegacyCollection(database) {
  const hasLegacyCollection = await database.listCollections({ name: 'crimes' }).hasNext();
  if (!hasLegacyCollection) return;

  const hasIncidentsCollection = await database.listCollections({ name: 'incidents' }).hasNext();
  if (!hasIncidentsCollection) {
    await database.collection('crimes').rename('incidents');
    return;
  }

  const legacyIncidents = database.collection('crimes').find();
  let operations = [];
  for await (const document of legacyIncidents) {
    operations.push({
      replaceOne: {
        filter: { _id: document._id },
        replacement: document,
        upsert: true
      }
    });
    if (operations.length === 500) {
      await database.collection('incidents').bulkWrite(operations, { ordered: false });
      operations = [];
    }
  }
  if (operations.length) {
    await database.collection('incidents').bulkWrite(operations, { ordered: false });
  }
  await database.collection('crimes').drop();
}

async function migrateLegacyIncidents(database) {
  await moveLegacyCollection(database);

  const incidents = database.collection('incidents');
  await incidents.updateMany({}, [
    {
      $set: {
        type: { $ifNull: ['$type', '$tipo'] },
        city: { $ifNull: ['$city', '$cidade'] },
        state: { $ifNull: ['$state', { $ifNull: ['$estado', 'PB'] }] },
        neighborhood: { $ifNull: ['$neighborhood', '$bairro'] },
        street: { $ifNull: ['$street', '$rua'] },
        address: { $ifNull: ['$address', '$endereco'] },
        victimCount: { $ifNull: ['$victimCount', { $ifNull: ['$numeroVitimas', 1] }] },
        offenderCount: { $ifNull: ['$offenderCount', { $ifNull: ['$numeroCriminosos', 1] }] },
        occurredAt: { $ifNull: ['$occurredAt', { $ifNull: ['$dataOcorrencia', '$$NOW'] }] },
        createdAt: { $ifNull: ['$createdAt', { $ifNull: ['$criadoEm', '$$NOW'] }] }
      }
    },
    {
      $set: {
        type: {
          $switch: {
            branches: [
              { case: { $eq: ['$type', 'Furto'] }, then: 'Theft' },
              { case: { $eq: ['$type', 'Roubo a Transeunte'] }, then: 'Street Robbery' },
              { case: { $eq: ['$type', 'Furto de Veículo'] }, then: 'Vehicle Theft' },
              { case: { $eq: ['$type', 'Vandalismo'] }, then: 'Vandalism' },
              { case: { $eq: ['$type', 'Roubo a Comércio'] }, then: 'Commercial Robbery' }
            ],
            default: '$type'
          }
        }
      }
    },
    { $unset: legacyFieldNames }
  ]);
}

module.exports = { migrateLegacyIncidents };
