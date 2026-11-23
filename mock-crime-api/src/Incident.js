const mongoose = require('mongoose');

const incidentSchema = new mongoose.Schema({
  type: { type: String, required: true, index: true },
  city: { type: String, required: true, index: true },
  state: { type: String, required: true, default: 'PB', index: true },
  neighborhood: { type: String, required: true, index: true },
  street: { type: String, required: true, index: true },
  address: { type: String, required: true },
  victimCount: { type: Number, required: true, min: 1, max: 5 },
  offenderCount: { type: Number, required: true, min: 1, max: 4 },
  occurredAt: { type: Date, default: Date.now, index: true },
  createdAt: { type: Date, default: Date.now, index: true }
}, { collection: 'incidents' });

module.exports = mongoose.models.Incident || mongoose.model('Incident', incidentSchema);
