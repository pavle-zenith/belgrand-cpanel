const Display = require('../models/Display');
const Client = require('../models/Client');

exports.createDisplay = async (req, res) => {
  const { name, location, resolution } = req.body;
  const display = new Display({ name, location, resolution });
  await display.save();
  res.status(200).send(display);
};

exports.getDisplays = async (req, res) => {
  const displays = await Display.find();
  res.status(200).send(displays);
};

exports.createClient = async (req, res) => {
  const { name, email, password, displayIds } = req.body;
  const client = new Client({ name, email, password, displays: displayIds });
  await client.save();
  res.status(200).send(client);
};

exports.getClients = async (req, res) => {
  const clients = await Client.find().populate('displays');
  res.status(200).send(clients);
};
