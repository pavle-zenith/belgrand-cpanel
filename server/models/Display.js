const mongoose = require('mongoose');

const DisplaySchema = new mongoose.Schema({
  name: String,
  location: String,
  resolution: String
});

module.exports = mongoose.model('Display', DisplaySchema);
