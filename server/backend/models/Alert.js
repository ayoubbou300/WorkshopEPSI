const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  type: { type: String, enum: ['PIR_MOTION', 'AI_VISION', 'GAS_CRITICAL'], required: true },
  message: { type: String, required: true },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Alert', alertSchema);
