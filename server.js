const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const authMiddleware = require('./middleware/authMiddleware');
const userRoutes = require('./routes/userRoutes');
const User = require('./models/user');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

const port = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
}));
app.use(helmet());
app.use(bodyParser.json({ limit: '10mb' }));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
});
app.use(limiter);

// Database Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Could not connect to MongoDB', err));

// Multer setup (for handling file uploads)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Routes
app.post('/api/profile-picture', upload.single('profilePicture'), authMiddleware, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const userId = req.user.userId;
    const profilePictureBase64 = req.file.buffer.toString('base64');

    const user = await User.findByIdAndUpdate(userId, { profilePicture: profilePictureBase64 }, { new: true });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ profilePicture: profilePictureBase64 });
  } catch (err) {
    console.error('Error uploading profile picture:', err);
    res.status(500).json({ error: 'Server error, please try again later' });
  }
});

// Use Routes
app.use('/api', userRoutes);

// WebSocket signaling
const liveQueue = [];
const liveUsers = new Set();  // Track users who are currently live
const activeStreams = new Map(); // Track active streams

const notifyNextUserInQueue = () => {
  if (liveQueue.length > 0) {
    const nextClient = liveQueue[0];
    console.log(`Notifying next client in queue: ${nextClient}`);
    io.to(nextClient).emit("go-live");
  } else {
    io.emit("no-one-live"); // Notify all clients that no one is live
  }
};

const updateLiveUsers = () => {
  io.emit('live-users', Array.from(liveUsers)); // Broadcast the list of live users
};
io.on("connection", (socket) => {
  console.log(`New client connected: ${socket.id}`);

  // Send current live stream info to new client
  if (liveUsers.size > 0) {
    const currentLiveUser = Array.from(liveUsers)[0];
    socket.emit("main-feed", currentLiveUser);
  }

  socket.on("join-queue", () => {
    console.log(`Client ${socket.id} joining queue`);
    liveQueue.push(socket.id);
    if (liveQueue.length === 1) {
      io.to(socket.id).emit("go-live");
    }
  });

  socket.on("go-live", () => {
    console.log(`Client ${socket.id} going live`);
    liveUsers.add(socket.id);  // Add user to the live users set
    activeStreams.set(socket.id, socket.id);  // Track active stream
    updateLiveUsers();  // Update all clients with the new list of live users
    io.emit('main-feed', socket.id); // Broadcast the live stream id to all clients
  });

  socket.on("request-offer", (liveUserId) => {
    io.to(liveUserId).emit("new-peer", socket.id);
  });

  socket.on("offer", (id, offer) => {
    console.log(`Client ${socket.id} sending offer to ${id}`);
    socket.to(id).emit("offer", socket.id, offer);
  });

  socket.on("answer", (id, answer) => {
    console.log(`Client ${socket.id} sending answer to ${id}`);
    socket.to(id).emit("answer", socket.id, answer);
  });

  socket.on("ice-candidate", (id, candidate) => {
    console.log(`Client ${socket.id} sending ICE candidate to ${id}`);
    socket.to(id).emit("ice-candidate", socket.id, candidate);
  });

  socket.on("stop-live", () => {
    console.log(`Client ${socket.id} stopping live`);
    liveQueue.shift();
    liveUsers.delete(socket.id);  // Remove user from the live users set
    activeStreams.delete(socket.id);
    updateLiveUsers();  // Update all clients with the new list of live users
    notifyNextUserInQueue();
    io.emit('main-feed', null); // Notify all clients that the live stream has stopped
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
    const index = liveQueue.indexOf(socket.id);
    if (index > -1) {
      liveQueue.splice(index, 1);
      liveUsers.delete(socket.id);  // Remove user from the live users set
      activeStreams.delete(socket.id);
      updateLiveUsers();  // Update all clients with the new list of live users
      notifyNextUserInQueue();
    }
    socket.broadcast.emit("peer-disconnected", socket.id);
  });
});


server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
