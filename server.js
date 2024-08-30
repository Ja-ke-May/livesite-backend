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
const { handleSocketConnection } = require('./socketHandler'); 

const User = require('./models/user');
const Report = require('./models/report');
const Comment = require('./models/comment');
console.log('Comment model:', Comment);

dotenv.config();

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS configuration
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'https://livesite-mu.vercel.app',
    methods: ["GET", "POST"],
  },
});

const port = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://livesite-mu.vercel.app',
  credentials: true,
}));

app.use(helmet());
app.use(bodyParser.json({ limit: '10mb' }));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000, // limit each IP to 10000 requests per windowMs
});
app.use(limiter);

// Database Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Could not connect to MongoDB', err));

// Multer setup with file type and size validation
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Invalid file type. Only JPEG, PNG, and GIF are allowed.'));
    }
    cb(null, true);
  },
  limits: { fileSize: 1024 * 1024 * 10 }, 
});

// Routes
app.post('/profile-picture', upload.single('profilePicture'), authMiddleware, async (req, res) => {
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

app.post('/comments', authMiddleware, async (req, res) => {
  try {
    const { comment, username } = req.body;  

    if (!comment || comment.trim() === '') {
      return res.status(400).json({ message: 'Comment cannot be empty' });
    }

    if (!username) {
      return res.status(400).json({ message: 'Username is required' });
    }

    // Fetch the user's profile to get the color settings
    const user = await User.findOne({ userName: username });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const newComment = new Comment({
      username,
      comment: comment.trim(),
      commentColor: user.commentColor, // Use the user's comment color
      borderColor: user.borderColor,   // Use the user's border color
      usernameColor: user.usernameColor, // Use the user's username color
    });

    await newComment.save();

    // Emit the new comment via Socket.IO to update all clients in real-time
    io.emit('new-comment', {
      username,
      comment: newComment.comment,
      commentColor: newComment.commentColor,
      borderColor: newComment.borderColor,
      usernameColor: newComment.usernameColor,
      createdAt: newComment.createdAt,
    });

    res.status(201).json({ message: 'Comment saved successfully' });
  } catch (err) {
    console.error('Error saving comment:', err);
    res.status(500).json({ error: 'Server error, please try again later' });
  }
});


app.post('/report', authMiddleware, async (req, res) => {
  try {
    const { content } = req.body;
    const userId = req.user.userId; 

    if (!content) {
      return res.status(400).json({ message: 'Content is required' });
    }

    const report = new Report({
      userId,
      content,
    });

    await report.save();

    res.status(201).json({ message: 'Report submitted successfully' });
  } catch (err) {
    console.error('Error submitting report:', err);
    res.status(500).json({ error: 'Server error, please try again later' });
  }
});

// Use Routes
app.use('/', userRoutes);

// Initialize Socket.IO
handleSocketConnection(io);

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
