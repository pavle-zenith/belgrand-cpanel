const mongoose = require('mongoose');

const ClientSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  displays: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Display' }],
  media: [String]
});

module.exports = mongoose.model('Client', ClientSchema);
