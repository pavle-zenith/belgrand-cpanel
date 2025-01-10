const express = require('express');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const multer = require('multer');
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();

// Apply CORS middleware to allow all origins
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

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
        // Note: You had duplicate "script-src" in your original code;
        // keep whichever you need (with 'unsafe-inline' as you prefer).
        "script-src-attr": ["'unsafe-inline'"],
        "img-src": ["'self'", "data:"],
        "font-src": ["'self'", "https://fonts.gstatic.com"],
        "media-src": ["'self'", "blob:"],
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

// Ensure data directory/files exist
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if (!fs.existsSync(adminFile)) {
  writeJson(adminFile, [
    {
      id: 1,
      name: 'TestAdmin',
      password: 'admin123',
    },
  ]);
}
if (!fs.existsSync(clientFile)) writeJson(clientFile, []);
if (!fs.existsSync(displayFile)) {
  writeJson(displayFile, [
    {
      id: 1,
      ownerId: 1,
      name: 'Main Display',
      location: 'Lobby',
      resolution: '1920x1080',
    },
    {
      id: 2,
      ownerId: 1,
      name: 'Secondary Display',
      location: 'Office',
      resolution: '1280x720',
    },
  ]);
}

// Multer for file uploads
const upload = multer({ dest: 'uploads/' });

// S3 Configuration (adjust to your environment)
const s3 = new AWS.S3({
  endpoint: 'https://nbg1.your-objectstorage.com',
  accessKeyId: 'YOUR_ACCESS_KEY',
  secretAccessKey: 'YOUR_SECRET_KEY',
  region: 'eu-central',
  s3ForcePathStyle: true,
  signatureVersion: 'v4',
  httpOptions: {
    rejectUnauthorized: false, // If using self-signed SSL
  },
});

// Define the Hetzner Base URL (adjust to your bucket name/path)
const HETZNER_BASE_URL = 'https://nbg1.your-objectstorage.com/belgrand-player/';

// Helper function to upload video to S3
const uploadToS3 = (filePath, bucket, key) => {
  console.log(`Uploading file to S3. Bucket: ${bucket}, Key: ${key}`);
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
        (s3Err, result) => {
          if (s3Err) return reject(s3Err);
          console.log(`Uploaded to S3: ${result.Location}`);
          resolve(result.Location);
        }
      );
    });
  });
};

// ================== ROUTES ==================

// --- Home route: Serve Login Page ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/login.html'));
});

// ================== LOGIN ==================
// Now we only accept { username, password, role } and find matching admin/client
app.post('/auth/login', (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ success: false, message: 'Missing credentials or role.' });
  }

  if (role === 'admin') {
    const admins = readJson(adminFile);
    const admin = admins.find((a) => a.name === username && a.password === password);
    if (admin) {
      return res.status(200).json({
        success: true,
        redirect: '/admin',
        adminId: admin.id, // Return the admin ID for filtering
      });
    }
  }

  if (role === 'client') {
    const clients = readJson(clientFile);
    const client = clients.find((c) => c.name === username && c.password === password);
    if (client) {
      return res.status(200).json({
        success: true,
        redirect: '/client',
        clientId: client.id,
      });
    }
  }

  return res.status(401).json({ success: false, message: 'Invalid credentials' });
});

// ================== ADMIN / CLIENT PAGES ==================
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/adminPanel.html'));
});

app.get('/client', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/clientPanel.html'));
});

// ================== GET DISPLAYS (Filtered by adminId) ==================
app.get('/displays', (req, res) => {
  const adminId = parseInt(req.query.adminId, 10);
  if (!adminId) {
    return res.status(400).json({ message: 'Missing adminId query parameter.' });
  }
  const allDisplays = readJson(displayFile);
  const displays = allDisplays.filter((d) => d.ownerId === adminId);
  res.json(displays);
});

// ================== GET CLIENTS (Filtered by adminId) ==================
app.get('/clients', (req, res) => {
  const adminId = parseInt(req.query.adminId, 10);
  if (!adminId) {
    return res.status(400).json({ message: 'Missing adminId query parameter.' });
  }
  const allClients = readJson(clientFile);
  const clients = allClients.filter((c) => c.ownerId === adminId);
  res.json(clients);
});

// ================== CREATE DISPLAY ==================
app.post('/create-display', (req, res) => {
  const { adminId, name, location, resolution } = req.body;
  if (!adminId || !name || !location || !resolution) {
    return res
      .status(400)
      .json({ message: 'adminId, name, location, and resolution are required.' });
  }

  const allDisplays = readJson(displayFile);
  const newDisplay = {
    id: Date.now(),
    ownerId: adminId,
    name,
    location,
    resolution,
  };
  allDisplays.push(newDisplay);
  writeJson(displayFile, allDisplays);

  return res.status(201).json(newDisplay);
});

// ================== CREATE USER (CLIENT) ==================
app.post('/create-user', (req, res) => {
  const { adminId, name, password, displayIds } = req.body;
  if (!adminId || !name || !password) {
    return res.status(400).json({ message: 'adminId, name, password are required.' });
  }

  const allDisplays = readJson(displayFile);
  // Only assign displays belonging to this admin
  const assignedDisplays = Array.isArray(displayIds)
    ? allDisplays.filter((d) => displayIds.includes(d.id) && d.ownerId === adminId)
    : [];

  const allClients = readJson(clientFile);
  const newClient = {
    id: Date.now(),
    ownerId: adminId, // track the admin who created this user
    name,
    password,
    displays: assignedDisplays,
    videos: [],
  };
  allClients.push(newClient);
  writeJson(clientFile, allClients);

  return res.status(201).json(newClient);
});

// ================== EDIT DISPLAY ==================
app.post('/edit-display', (req, res) => {
  const { adminId, id, name, location, resolution } = req.body;
  if (!adminId || !id || !name || !location || !resolution) {
    return res
      .status(400)
      .json({ message: 'adminId, id, name, location, and resolution are required.' });
  }

  const allDisplays = readJson(displayFile);
  const displayIndex = allDisplays.findIndex((d) => d.id === Number(id) && d.ownerId === adminId);
  if (displayIndex === -1) {
    return res.status(404).json({ message: 'Display not found or you are not the owner.' });
  }

  // Update display
  allDisplays[displayIndex].name = name;
  allDisplays[displayIndex].location = location;
  allDisplays[displayIndex].resolution = resolution;

  writeJson(displayFile, allDisplays);
  return res.status(200).json({ message: 'Display updated successfully.' });
});

// ================== DELETE DISPLAY ==================
// We pass both adminId and displayId in the route to check ownership
app.delete('/delete-display/:adminId/:displayId', (req, res) => {
  const adminId = parseInt(req.params.adminId, 10);
  const displayId = parseInt(req.params.displayId, 10);

  const allDisplays = readJson(displayFile);
  const displayIndex = allDisplays.findIndex(
    (d) => d.id === displayId && d.ownerId === adminId
  );
  if (displayIndex === -1) {
    return res.status(404).json({ message: 'Display not found or not owned by you.' });
  }

  const [deleted] = allDisplays.splice(displayIndex, 1);
  writeJson(displayFile, allDisplays);

  // Remove this display from any clients that have it
  const allClients = readJson(clientFile);
  allClients.forEach((c) => {
    c.displays = c.displays.filter((d) => d.id !== displayId);
  });
  writeJson(clientFile, allClients);

  return res.status(200).json({ message: 'Display deleted.', deletedDisplay: deleted });
});

// ================== GET USER DISPLAYS ==================
// (For loading assigned displays in the UI)
app.get('/user-displays/:id', (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const allClients = readJson(clientFile);
  const user = allClients.find((c) => c.id === userId);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  return res.json(user.displays || []);
});

// ================== EDIT USER (CLIENT) ==================
app.post('/edit-user', (req, res) => {
  const { adminId, id, name, password, displayIds } = req.body;
  if (!adminId || !id || !name || !password || !Array.isArray(displayIds)) {
    return res.status(400).json({
      message: 'adminId, id, name, password, and displayIds are required.',
    });
  }

  const allClients = readJson(clientFile);
  const clientIndex = allClients.findIndex(
    (c) => c.id === Number(id) && c.ownerId === adminId
  );
  if (clientIndex === -1) {
    return res.status(404).json({ message: 'User not found or not owned by you.' });
  }

  const oldUser = allClients[clientIndex];
  const oldVideos = oldUser.videos || [];
  const oldDisplays = oldUser.displays || [];

  // Filter only this admin's displays
  const allDisplays = readJson(displayFile).filter((d) => d.ownerId === adminId);

  // Reassign displays, preserving any videoLink
  const assignedDisplays = allDisplays
    .filter((d) => displayIds.includes(d.id))
    .map((newDisplay) => {
      const matchingOld = oldDisplays.find((od) => od.id === newDisplay.id);
      return matchingOld
        ? { ...newDisplay, videoLink: matchingOld.videoLink }
        : { ...newDisplay };
    });

  // Update user fields
  oldUser.name = name;
  oldUser.password = password;
  oldUser.displays = assignedDisplays;
  oldUser.videos = oldVideos; // keep existing videos

  allClients[clientIndex] = oldUser;
  writeJson(clientFile, allClients);

  return res.status(200).json({ message: 'User updated successfully.' });
});

// ================== DELETE USER (CLIENT) ==================
app.delete('/delete-user/:adminId/:userId', (req, res) => {
  const adminId = parseInt(req.params.adminId, 10);
  const userId = parseInt(req.params.userId, 10);

  const allClients = readJson(clientFile);
  const clientIndex = allClients.findIndex(
    (c) => c.id === userId && c.ownerId === adminId
  );
  if (clientIndex === -1) {
    return res.status(404).json({ message: 'User not found or not owned by you.' });
  }

  const [deletedUser] = allClients.splice(clientIndex, 1);
  writeJson(clientFile, allClients);

  return res.status(200).json({ message: 'User deleted successfully.', deletedUser });
});

// ================== CLIENT VIDEO UPLOAD & MANAGEMENT ==================

// Example endpoint to get display content by clientId (unchanged except you may want to check ownership)
app.get('/client/content', (req, res) => {
  const { clientId } = req.query;

  if (!clientId) {
    return res.status(400).json({ message: 'Client ID is required.' });
  }
  const allClients = readJson(clientFile);
  const client = allClients.find((c) => c.id === Number(clientId));
  if (!client) {
    return res.status(404).json({ message: `Client ${clientId} not found.` });
  }
  // Return minimal info about assigned displays
  const content = client.displays.map((d) => ({
    id: d.id,
    name: d.name,
    resolution: d.resolution,
    location: d.location,
    videoLink: d.videoLink || null,
  }));
  return res.json(content);
});

// Upload Video to S3 (unchanged except for your environment needs)
app.post('/client/upload', upload.single('video'), async (req, res) => {
  try {
    const { clientId } = req.body;
    if (!req.file || !clientId) {
      return res
        .status(400)
        .json({ message: 'Video file and Client ID are required.' });
    }

    const allClients = readJson(clientFile);
    const client = allClients.find((c) => c.id === Number(clientId));
    if (!client) {
      return res.status(404).json({ message: 'Client not found.' });
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
    writeJson(clientFile, allClients);

    res
      .status(200)
      .json({ message: 'Video uploaded successfully!', videoUrl: fileUrl });
  } catch (error) {
    console.error('Upload error:', error);
    res
      .status(500)
      .json({ message: 'Failed to upload video.', error: error.message });
  }
});

// Fetch Videos for a Client
app.get('/client/videos', (req, res) => {
  const { clientId } = req.query;
  if (!clientId) {
    return res.status(400).json({ message: 'Client ID is required.' });
  }

  const allClients = readJson(clientFile);
  const client = allClients.find((c) => c.id === Number(clientId));
  if (!client) {
    return res.status(404).json({ message: 'Client not found.' });
  }
  res.json(client.videos || []);
});

// Publish Video to a Display
app.post('/client/publish', async (req, res) => {
  const { clientId, displays, videoUrl } = req.body;
  if (!clientId || !displays || !videoUrl) {
    return res
      .status(400)
      .json({ message: 'Client ID, displays, and video URL are required.' });
  }

  const allClients = readJson(clientFile);
  const client = allClients.find((c) => c.id === Number(clientId));
  if (!client) {
    return res.status(404).json({ message: 'Client not found.' });
  }

  try {
    console.log(`Original Video URL: ${videoUrl}`);
    let formattedVideoUrl = videoUrl;
    if (!/^https?:\/\//i.test(videoUrl)) {
      formattedVideoUrl = `https://${videoUrl}`;
      console.warn(`Video URL missing protocol. Using: ${formattedVideoUrl}`);
    }

    const urlObj = new URL(formattedVideoUrl);
    const baseUrlObj = new URL(HETZNER_BASE_URL);
    let pathAfterBase = urlObj.pathname;

    // Remove the base path if it's repeated
    if (pathAfterBase.startsWith(baseUrlObj.pathname)) {
      pathAfterBase = pathAfterBase.substring(baseUrlObj.pathname.length);
    } else {
      pathAfterBase = pathAfterBase.replace(/^\/+/, '');
    }

    const hetznerVideoUrl = `${HETZNER_BASE_URL}${pathAfterBase}`;
    console.log(`Hetzner Video URL: ${hetznerVideoUrl}`);

    // Assign the videoLink to each selected display
    for (const displayId of displays) {
      const disp = client.displays.find((d) => d.id === Number(displayId));
      if (disp) {
        disp.videoLink = hetznerVideoUrl;
      }
    }

    writeJson(clientFile, allClients);
    res.status(200).json({ message: 'Video successfully published to displays.' });
  } catch (err) {
    console.error('Error publishing video:', err);
    res
      .status(500)
      .json({ message: 'Failed to publish video.', error: err.message });
  }
});

// Get Current Video for a Display (then redirect)
app.get('/client/getCurrentVideo/:clientId/:displayId', async (req, res) => {
  const { clientId, displayId } = req.params;
  const allClients = readJson(clientFile);
  const client = allClients.find((c) => c.id === Number(clientId));
  if (!client) {
    return res.status(404).json({ message: 'Client not found.' });
  }

  const display = client.displays.find((d) => d.id === Number(displayId));
  if (!display || !display.videoLink) {
    return res.status(404).json({ message: 'Video for that display not found.' });
  }

  try {
    const videoUrl = display.videoLink;
    console.log(`Redirecting to video: ${videoUrl}`);
    res.status(302).redirect(videoUrl);
  } catch (error) {
    console.error('Error fetching video:', error);
    res.status(500).json({ message: 'Failed to serve video.', error: error.message });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
