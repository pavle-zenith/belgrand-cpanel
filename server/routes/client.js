const express = require('express');
const { getMedia, uploadMedia } = require('../controllers/clientController');
const router = express.Router();

router.get('/media', getMedia);
router.post('/upload-media', uploadMedia);

module.exports = router;
