const Admin = require('../models/Admin');
const Client = require('../models/Client');

exports.login = async (req, res) => {
  const { email, password, role } = req.body;
  let user;
  if (role === 'admin') user = await Admin.findOne({ email, password });
  else user = await Client.findOne({ email, password });

  if (user) res.status(200).send({ success: true, user });
  else res.status(401).send({ success: false, message: 'Invalid credentials' });
};
