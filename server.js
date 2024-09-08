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
  const { handleSocketConnection, onlineUsers } = require('./socketHandler'); 
  const { sendBlockNotificationEmail } = require('./emails')
  const handleStripeWebhook = require('./stripeWebhook');
  const cron = require('node-cron');
  


  const app = express();
  const server = http.createServer(app);

  const User = require('./models/user');
  const Report = require('./models/report');
  const Comment = require('./models/comment');
  const UserAds = require('./models/userAds');

  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    const sig = req.headers['stripe-signature'];
    handleStripeWebhook(req, res);
});


  const bodyParser = require('body-parser');
  const authMiddleware = require('./middleware/authMiddleware');

  dotenv.config();


// Delete unactivated accounts every hour
cron.schedule('0 * * * *', async () => {
  try {
    const now = new Date();
    await User.deleteMany({ isActivated: false, activationExpires: { $lt: now } });
    console.log('Deleted expired unactivated accounts');
  } catch (err) {
    console.error('Error deleting unactivated accounts', err);
  }
});

cron.schedule('0 0 * * *', async () => {
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    await UserAds.updateMany(
      { "links.createdAt": { $lte: oneWeekAgo } },
      { $pull: { links: { createdAt: { $lte: oneWeekAgo } } } }
    );
    console.log('Old ads removed successfully');
  } catch (err) {
    console.error('Error removing old ads:', err);
  }
});

  // Initialize Socket.IO with CORS configuration
  const io = socketIo(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'https://www.myme.live',
      methods: ["GET", "POST"],
    },
  });

  const port = process.env.PORT || 5000;

  // Middleware
  app.use(cors({
    origin: process.env.FRONTEND_URL || 'https://www.myme.live',
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

      if (user.isBlocked) {
        return res.status(403).json({ message: 'You are blocked from commenting.' });
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


// Block user route
app.post('/block-user', authMiddleware, async (req, res) => {
  const { username, duration } = req.body;
  
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ message: 'Unauthorized action' });
    }

    const user = await User.findOne({ userName: username });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let blockExpiryDate = null;
    
     // Set block expiry based on the selected duration
     switch (duration) {
      case '1 day':
        blockExpiryDate = new Date();
        blockExpiryDate.setDate(blockExpiryDate.getDate() + 1);
        break;
      case '1 week':
        blockExpiryDate = new Date();
        blockExpiryDate.setDate(blockExpiryDate.getDate() + 7);
        break;
      case '1 month':
        blockExpiryDate = new Date();
        blockExpiryDate.setMonth(blockExpiryDate.getMonth() + 1);
        break;
      case 'permanent':
        blockExpiryDate = null; // Permanent block
        break;
      default:
        return res.status(400).json({ message: 'Invalid block duration' });
    }

    // Update user block status
    user.isBlocked = true;
    user.blockExpiryDate = blockExpiryDate;
    
    await user.save();

    await sendBlockNotificationEmail(user, duration);

      // Forcefully log out all sockets connected with the blocked username
    for (const [socketId, onlineUsername] of onlineUsers.entries()) {
      if (onlineUsername === username) {
        io.to(socketId).emit('forceLogout', { message: 'You have been blocked.' });
        io.sockets.sockets.get(socketId).disconnect(true);
        console.log(`Socket ${socketId} for user ${username} forcefully logged out.`);
      }
    }
    res.status(200).json({ message: `User ${username} blocked for ${duration}` });
  } catch (err) {
    console.error('Error blocking user:', err);
    res.status(500).json({ error: 'Server error, please try again later' });
  }
})

app.get('/ads', authMiddleware, async (req, res) => {
  try {
    const ads = await UserAds.aggregate([
      { $unwind: '$links' }, 
      { $sort: { 'links.createdAt': 1 } }, 
      { $project: { _id: 0, 'links.text': 1, 'links.url': 1, 'links.imageUrl': 1, 'links.createdAt': 1 } }, 
    ]);

    res.json({ ads });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching ads', error });
  }
});


app.post('/ads/send-link', authMiddleware, async (req, res) => {
  try {
    const { link } = req.body; // Expect the full link object in the request body
    const userId = req.user.userId;

    if (!link || !link.text || !link.url || !link.imageUrl) {
      return res.status(400).json({ message: 'Incomplete link data' });
    }

    // Fetch the user by userId
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if an entry already exists in UserAds for this user
    let userAd = await UserAds.findOne({ username: user.userName });

    if (!userAd) {
      // Create a new UserAds document if it doesn't exist
      userAd = new UserAds({
        username: user.userName,
        links: [link] // Add the full link object to the UserAds document
      });
    } else {
      // Check if the user already has 20 links
      if (userAd.links.length >= 20) {
        return res.status(400).json({ message: 'Maximum of 20 links reached in ads.' });
      }

      // Add the new link to the existing UserAds document
      userAd.links.push(link);
    }

    // Save the UserAds document
    await userAd.save();

    res.status(200).json({ message: 'Link successfully sent to ads.', userAd });
  } catch (err) {
    console.error('Error sending link to ads:', err);
    res.status(500).json({ error: 'Server error, please try again later.' });
  }
});


  app.use('/', userRoutes);

  handleSocketConnection(io);

  server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
