const mongoose = require('mongoose');

const telemetrySchema = new mongoose.Schema({
  device_id: { type: String, default: 'SENTINEL-NODE-01' },
  temperature: { type: Number, required: true },
  humidity: { type: Number, required: true },
  gas: { type: Number, required: true },
  motion: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Telemetry', telemetrySchema);
