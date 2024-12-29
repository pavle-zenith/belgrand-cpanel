const express = require('express');
const {
  createDisplay,
  getDisplays,
  createClient,
  getClients,
} = require('../controllers/adminController');
const router = express.Router();

router.post('/create-display', createDisplay);
router.get('/displays', getDisplays);
router.post('/create-client', createClient);
router.get('/clients', getClients);

module.exports = router;
