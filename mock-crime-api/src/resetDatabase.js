const mongoose = require('mongoose');
const Incident = require('./Incident');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ssp_mock';
const CONFIRMATION = 'ssp_mock';

async function resetDatabase() {
  const database = new URL(MONGO_URI).pathname.slice(1).split('?')[0];
  if (database !== CONFIRMATION || process.env.CONFIRM_MONGO_RESET !== CONFIRMATION) {
    throw new Error(
      `To clear only the ssp_mock database, set CONFIRM_MONGO_RESET=${CONFIRMATION} and use that database in MONGO_URI.`
    );
  }

  await mongoose.connect(MONGO_URI);
  try {
    const result = await Incident.deleteMany({});
    console.log(`Removed ${result.deletedCount} incidents from ${database}.`);
  } finally {
    await mongoose.disconnect();
  }
}

resetDatabase().catch((err) => {
  console.error('Failed to clear the database:', err.message);
  process.exitCode = 1;
});
