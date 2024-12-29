const mongoose = require('mongoose');

const AdminSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  displays: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Display' }],
  clients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Client' }]
});

module.exports = mongoose.model('Admin', AdminSchema);