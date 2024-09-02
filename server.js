  // server.js
  const express = require('express');
  const http = require('http');
  const socketIo = require('socket.io');
  const mongoose = require('mongoose');
  const dotenv = require('dotenv');
  const cors = require('cors');
  const helmet = require('helmet');
  const rateLimit = require('express-rate-limit');
  const multer = require('multer');
  const userRoutes = require('./routes/userRoutes');
  const { handleSocketConnection } = require('./socketHandler'); 
  const handleStripeWebhook = require('./stripeWebhook');


  const app = express();
  const server = http.createServer(app);

  const User = require('./models/user');
  const Report = require('./models/report');
  const Comment = require('./models/comment');
  console.log('Comment model:', Comment);

  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    const sig = req.headers['stripe-signature'];
    console.log('Received raw body:', req.body.toString());
    console.log('Received signature:', sig);
    handleStripeWebhook(req, res);
});


  const bodyParser = require('body-parser');
  const authMiddleware = require('./middleware/authMiddleware');

  dotenv.config();




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
        commentColor: user.commentColor, 
        borderColor: user.borderColor,   
        usernameColor: user.usernameColor, 
      });

      await newComment.save();

      res.status(201).json({ message: 'Comment saved and emitted successfully' });
    } catch (err) {
      console.error('Error saving and emitting comment:', err);
      res.status(500).json({ error: 'Server error, please try again later' });
    }
  });

  app.use('/', userRoutes);

  handleSocketConnection(io);

  server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
