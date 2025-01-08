const express = require('express');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const multer = require('multer');
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const cors = require('cors'); // Import the cors package
const app = express();

// Apply CORS middleware to allow all origins
app.use(cors()); // This will allow all CORS requests

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
        "script-src": ["'self'", "'unsafe-inline'"], // Allow inline scripts
        "script-src-attr": ["'unsafe-inline'"], // Allow inline event handlers
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

// Define the Hetzner Base URL
const HETZNER_BASE_URL = 'https://belgrand-player.nbg1.your-objectstorage.com/belgrand-player/'; // Update if different

// Upload Video to S3
const uploadToS3 = (filePath, bucket, key) => {
  console.log(`Uploading file to S3. Bucket: ${bucket}, Key: ${key}`); // Debugging
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, data) => {
      if (err) return reject(err);

      s3.upload(
        {
          Bucket: bucket,
          Key: key,
          Body: data,
          ACL: 'public-read',
          ContentType: 'video/mp4',
        },
        (err, data) => {
          if (err) return reject(err);
          console.log(`Uploaded to S3: ${data.Location}`); // Debugging
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
    videos: [], // Initialize videos array
  };

  clients.push(newClient);
  writeJson(clientFile, clients);

  res.status(201).send(newClient);
});

// API: Upload Video
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

app.post('/edit-display', (req, res) => {
  const { id, name, location, resolution } = req.body;

  if (!id || !name || !location || !resolution) {
    return res.status(400).send({ message: 'All fields are required.' });
  }

  const displays = readJson(displayFile);
  const display = displays.find((d) => d.id === Number(id));

  if (!display) {
    return res.status(404).send({ message: 'Display not found.' });
  }

  // Update display details
  display.name = name;
  display.location = location;
  display.resolution = resolution;

  writeJson(displayFile, displays);
  res.status(200).send({ message: 'Display updated successfully.' });
});

// Delete Display
app.delete('/delete-display/:id', (req, res) => {
  const { id } = req.params;

  const displays = readJson(displayFile);
  const displayIndex = displays.findIndex((d) => d.id === Number(id));

  if (displayIndex === -1) {
    return res.status(404).send({ message: 'Display not found.' });
  }

  // Remove display from the list
  const [deletedDisplay] = displays.splice(displayIndex, 1);
  writeJson(displayFile, displays);

  // Remove the display from all clients
  const clients = readJson(clientFile);
  clients.forEach((client) => {
    client.displays = client.displays.filter((d) => d.id !== Number(id));
  });
  writeJson(clientFile, clients);

  res.status(200).send({ message: 'Display deleted successfully.', deletedDisplay });
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

const getUserVideoDirectory = (clientName) => `user/videos/${clientName}`;
const getActiveVideoPath = (clientName, displayName) =>
  `user/videos/${clientName}/${displayName}/active_video.mp4`;

// Upload Video to S3 under the correct directory
app.post('/client/upload', upload.single('video'), async (req, res) => {
  try {
    const { clientId } = req.body;

    if (!req.file || !clientId) {
      return res.status(400).send({ message: 'Video file and Client ID are required.' });
    }

    const clients = readJson(clientFile);
    const client = clients.find((c) => c.id === Number(clientId));

    if (!client) {
      return res.status(404).send({ message: 'Client not found.' });
    }

    const clientName = client.name.replace(/\s+/g, '_');
    const videoDirectory = `user/videos/${clientName}/`;
    const timestamp = Date.now();
    const sanitizedOriginalName = req.file.originalname.replace(/\s+/g, '_');
    const videoKey = `${videoDirectory}${timestamp}_${sanitizedOriginalName}`;

    console.log(`Uploading to directory: ${videoDirectory}`);
    console.log(`Full key: ${videoKey}`);

    const fileUrl = await uploadToS3(req.file.path, 'belgrand-player', videoKey);
    fs.unlinkSync(req.file.path);

    // Save the uploaded video link to the client's JSON
    if (!client.videos) {
      client.videos = [];
    }
    client.videos.push(fileUrl);
    writeJson(clientFile, clients);

    res.status(200).send({ message: 'Video uploaded successfully!', videoUrl: fileUrl });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).send({ message: 'Failed to upload video.', error: error.message });
  }
});

// Fetch Videos for a Client
app.get('/client/videos', (req, res) => {
  const { clientId } = req.query;

  if (!clientId) {
    return res.status(400).send({ message: 'Client ID is required.' });
  }

  const clients = readJson(clientFile);
  const client = clients.find((c) => c.id === Number(clientId));

  if (!client) {
    return res.status(404).send({ message: 'Client not found.' });
  }

  // Return the list of video links
  res.status(200).send(client.videos || []);
});

const makePublic = async (bucketName, key) => {
  const params = {
    Bucket: bucketName,
    Key: key, // Directory or file to make public
    ACL: 'public-read',
  };

  try {
    await s3.putObjectAcl(params).promise();
    console.log(`Successfully updated ACL for ${key}`);
  } catch (error) {
    console.error(`Error setting ACL for ${key}:`, error);
  }
};

// Publish Video to a Display
app.post('/client/publish', async (req, res) => {
  const { clientId, displays, videoUrl } = req.body;

  if (!clientId || !displays || !videoUrl) {
    return res.status(400).send({ message: 'Client ID, displays, and video URL are required.' });
  }

  const clients = readJson(clientFile);
  const client = clients.find((c) => c.id === Number(clientId));

  if (!client) {
    return res.status(404).send({ message: 'Client not found.' });
  }

  const clientName = client.name.replace(/\s+/g, '_');

  try {
    // Correct the source key by removing any extra prefix
    const sourceKey = videoUrl
      .replace('https://belgrand-player.nbg1.your-objectstorage.com/', '')
      .replace('belgrand-player/', ''); // Handle any redundant prefixes

    console.log(`Corrected Source Key: ${sourceKey}`);

    // Construct the Hetzner-hosted video URL
    const hetznerVideoUrl = `${HETZNER_BASE_URL}${sourceKey}`;
    console.log(`Hetzner Video URL: ${hetznerVideoUrl}`);

    // Process each selected display
    for (const displayId of displays) {
      const display = client.displays.find((d) => d.id === Number(displayId));
      if (display) {
        const displayName = display.name.replace(/\s+/g, '_');
        // Optionally, you can define a specific path or naming convention per display
        // For now, we'll use the hetznerVideoUrl directly

        console.log(`Assigning Video to Display ID ${displayId}: ${hetznerVideoUrl}`);

        display.videoLink = hetznerVideoUrl;
      }
    }

    writeJson(clientFile, clients); // Save updates to clients.json
    res.status(200).send({ message: 'Video successfully published to displays.' });
  } catch (error) {
    console.error('Error publishing video:', error);
    res.status(500).send({ message: 'Failed to publish video.', error: error.message });
  }
});

// Fetch Current Video for a Display and Redirect
app.get('/client/getCurrentVideo/:clientId/:displayId', async (req, res) => {
  const { clientId, displayId } = req.params;

  // Read the clients file
  const clients = readJson(clientFile);
  const client = clients.find((c) => c.id === Number(clientId));

  if (!client) {
    return res.status(404).send({ message: 'Client not found.' });
  }

  // Find the specific display
  const display = client.displays.find((d) => d.id === Number(displayId));

  if (!display || !display.videoLink) {
    return res.status(404).send({ message: 'Video for the specified display not found.' });
  }

  try {
    const videoUrl = display.videoLink;

    console.log(`Client ID: ${clientId}`);
    console.log(`Display ID: ${displayId}`);
    console.log(`Video URL: ${videoUrl}`);

    // Redirect the client to the Hetzner-hosted video URL
    res.status(302).redirect(videoUrl);
  } catch (error) {
    console.error('Error fetching video:', error);
    res.status(500).send({ message: 'Failed to serve video.', error: error.message });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
