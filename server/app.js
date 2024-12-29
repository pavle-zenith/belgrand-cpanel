const express = require('express');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const multer = require('multer');
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

// Helmet for basic security
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "img-src": ["'self'", "data:"],
        "font-src": ["'self'", "https://fonts.gstatic.com"],
        "media-src": ["'self'", "blob:"], // Allow blob: URLs for media
      },
    },
  })
);

// Paths for JSON files
const dataDir = path.join(__dirname, '../data');
const adminFile = path.join(dataDir, 'admins.json');
const clientFile = path.join(dataDir, 'clients.json');
const displayFile = path.join(dataDir, 'displays.json');

// Utility functions
const readJson = (filePath) => {
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
};

const writeJson = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

// Ensure dummy data exists
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if (!fs.existsSync(adminFile)) {
  writeJson(adminFile, [
    { id: 1, name: 'Admin User', email: 'admin@test.com', password: 'admin123' },
  ]);
}
if (!fs.existsSync(clientFile)) writeJson(clientFile, []);
if (!fs.existsSync(displayFile)) {
  writeJson(displayFile, [
    { id: 1, name: 'Main Display', location: 'Lobby', resolution: '1920x1080' },
    { id: 2, name: 'Secondary Display', location: 'Office', resolution: '1280x720' },
  ]);
}

// Multer for file uploads
const upload = multer({ dest: 'uploads/' });

// S3 Configuration
const s3 = new AWS.S3({
  endpoint: 'https://belgrand-player.nbg1.your-objectstorage.com',
  accessKeyId: '5M2CAZB41BS39E593X3R',
  secretAccessKey: 'qIb78jKe8aBS0ytXPWzkEIB0NFrWNLYbnVxMwnky',
  region: 'eu-central',
  s3ForcePathStyle: true,
  signatureVersion: 'v4',
  httpOptions: {
    rejectUnauthorized: false, // Ignore SSL for self-signed certificates
  },
});

// Upload Video to S3
const uploadToS3 = (filePath, bucket, key) => {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, data) => {
      if (err) return reject(err);

      s3.upload(
        {
          Bucket: bucket,
          Key: key,
          Body: data,
          ACL: 'public-read', // Omogućava javni pristup fajlu
          ContentType: 'video/mp4',
        },
        (err, data) => {
          if (err) return reject(err);
          resolve(data.Location);
        }
      );
    });
  });
};

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/login.html'));
});

app.post('/auth/login', (req, res) => {
  const { email, password, role } = req.body;

  if (role === 'admin') {
    const admins = readJson(adminFile);
    const admin = admins.find((a) => a.email === email && a.password === password);
    if (admin) {
      return res.status(200).send({ success: true, redirect: '/admin' });
    }
  }

  if (role === 'client') {
    const clients = readJson(clientFile);
    const client = clients.find((c) => c.email === email && c.password === password);
    if (client) {
      return res.status(200).send({ success: true, redirect: '/client', clientId: client.id });
    }
  }

  return res.status(401).send({ success: false, message: 'Invalid credentials' });
});

app.post("/client/publish", (req, res) => {
  const { clientId, displays } = req.body;

  if (!clientId || !displays || displays.length === 0) {
    return res
      .status(400)
      .send({ message: "Client ID and at least one display are required." });
  }

  const clients = readJson(clientFile);
  const client = clients.find((c) => c.id === Number(clientId));

  if (!client) {
    return res.status(404).send({ message: "Client not found." });
  }

  const videoUrl = `https://belgrand-player.nbg1.your-objectstorage.com/uploaded_video.mp4`;

  // Update the link for selected displays
  displays.forEach((displayId) => {
    const display = client.displays.find((d) => d.id === displayId);
    if (display) {
      display.videoLink = videoUrl;
    }
  });

  writeJson(clientFile, clients);
  res.status(200).send({ message: "Video link successfully added to displays." });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/adminPanel.html'));
});

app.get('/client', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/clientPanel.html'));
});

app.get('/displays', (req, res) => {
  const displays = readJson(displayFile);
  res.send(displays);
});

app.get('/clients', (req, res) => {
  const clients = readJson(clientFile);
  res.send(clients);
});

app.post('/create-display', (req, res) => {
  const { name, location, resolution } = req.body;
  const displays = readJson(displayFile);
  const newDisplay = { id: Date.now(), name, location, resolution };
  displays.push(newDisplay);
  writeJson(displayFile, displays);
  res.status(201).send(newDisplay);
});

app.post('/create-user', (req, res) => {
  const { name, email, password, displayIds } = req.body;

  const clients = readJson(clientFile);
  const displays = readJson(displayFile);

  const assignedDisplays = displays.filter((display) => displayIds.includes(display.id));

  const newClient = {
    id: Date.now(),
    name,
    email,
    password,
    displays: assignedDisplays,
  };

  clients.push(newClient);
  writeJson(clientFile, clients);

  res.status(201).send(newClient);
});

// API: Upload Video
app.post('/client/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send({ message: 'No video file provided.' });
    }

    const inputPath = req.file.path;

    // Use a fixed key for the uploaded video to ensure it replaces the old one
    const bucketName = 'belgrand-player';
    const keyName = `uploaded_video.mp4`; // Fixed key name for consistency

    const fileUrl = await uploadToS3(inputPath, bucketName, keyName);

    fs.unlinkSync(inputPath); // Remove temp file

    return res.status(200).send({ message: 'Video uploaded successfully!', videoUrl: fileUrl });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).send({ message: 'Failed to upload video.', error: error.message });
  }
});

app.get('/client/displays', (req, res) => {
  const { clientId } = req.query;

  if (!clientId) {
    return res.status(400).send({ message: 'Client ID is required in the query string.' });
  }

  const clients = readJson(clientFile);
  const client = clients.find((c) => c.id === Number(clientId));

  if (!client) {
    return res.status(404).send({ message: `Client with ID ${clientId} not found.` });
  }

  return res.status(200).send(client.displays);
});

app.get('/client/content', (req, res) => {
  const { clientId } = req.query;

  // Check if clientId is provided
  if (!clientId) {
    return res.status(400).send({ message: 'Client ID is required in the query string.' });
  }

  // Read the client data from the JSON file
  const clients = readJson(clientFile);

  // Find the client by ID
  const client = clients.find((c) => c.id === Number(clientId));

  // If the client is not found, return a 404 error
  if (!client) {
    return res.status(404).send({ message: `Client with ID ${clientId} not found.` });
  }

  // Retrieve the content/videos for the client
  const content = client.displays.map((display) => {
    return {
      id: display.id,
      name: display.name,
      resolution: display.resolution,
      location: display.location,
    };
  });

  return res.status(200).send(content);
});

app.get('/user-displays/:id', (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const clients = readJson(clientFile);
  const user = clients.find((c) => c.id === userId);

  if (user) {
    return res.status(200).send(user.displays);
  }
  return res.status(404).send({ message: 'User not found' });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
