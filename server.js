// server.js
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
const Comment = require('./models/comment');
const { handleSocketConnection, onlineUsers } = require('./socketHandler'); 

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "https://livesite-mu.vercel.app/",
    methods: ["GET", "POST"],
  },
});

const port = process.env.PORT || 'https://livesite-backend.onrender.com';

// Middleware
app.use(cors({
  origin: 'https://livesite-mu.vercel.app/',
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

// Add this route after your other routes
app.post('/api/comments', authMiddleware, async (req, res) => {
  try {
    const { comment, username } = req.body;  // Extract username and comment from the request body

    if (!comment || comment.trim() === '') {
      return res.status(400).json({ message: 'Comment cannot be empty' });
    }

    if (!username) {
      return res.status(400).json({ message: 'Username is required' });
    }

    const newComment = new Comment({
      username,
      comment: comment.trim(),
    });

    await newComment.save();

    res.status(201).json({ message: 'Comment saved successfully' });
  } catch (err) {
    console.error('Error saving comment:', err);
    res.status(500).json({ error: 'Server error, please try again later' });
  }
});


// Use Routes
app.use('/api', userRoutes);

// Endpoint to get the number of online users
app.get('/api/online-users', (req, res) => {
  res.json({ viewers: onlineUsers.size });
});

// Initialize Socket.IO
handleSocketConnection(io);

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
