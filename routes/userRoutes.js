const express = require('express');
const User = require('../models/user');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const multer = require('multer');

const storage = multer.memoryStorage();
const fileFilter = (req, file, cb) => {
  const validImageTypes = ['image/jpeg', 'image/png', 'image/gif'];
  if (validImageTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, and GIF files are allowed.'), false);
  }
};

const upload = multer({ storage: storage, fileFilter: fileFilter });

router.post('/profile-picture', (req, res, next) => {
  upload.single('profilePicture')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      // Handle Multer errors
      return res.status(400).json({ message: err.message });
    } else if (err) {
      // Handle other errors
      return res.status(400).json({ message: err.message });
    }

    next();
  });
}, authMiddleware, async (req, res) => {
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
    res.status(500).json({ error: err.message });
  }
});

router.post('/signup', async (req, res) => {
  try {
    const { userName, email, password, dob } = req.body;

    if (!userName || !email || !password || !dob) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const existingUser = await User.findOne({ userName });
    if (existingUser) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      userName,
      email,
      password: hashedPassword,
      dob,
    });

    await user.save();

    res.status(201).json({ message: 'User created successfully' });
  } catch (err) {
    console.error('Error during signup:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const normalizedEmail = email.toLowerCase();
    const user = await User.findOne({ email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') } });

    if (!user) {
      return res.status(401).json({ message: 'No account with this email' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Password incorrect' });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.json({ message: 'Login successful', token });
  } catch (err) {
    console.error('Error during login:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/check-username/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const existingUser = await User.findOne({ userName: username });

    if (existingUser) {
      return res.status(200).json({ available: false });
    }
    return res.status(200).json({ available: true });
  } catch (err) {
    console.error('Error checking username:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/profile/username', authMiddleware, async (req, res) => {
  try {
    const { userName } = req.body;

    if (!userName) {
      return res.status(400).json({ message: 'Username is required' });
    }

    const existingUser = await User.findOne({ userName });
    if (existingUser) {
      return res.status(400).json({ message: 'Username already taken' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const now = new Date();
    if (user.lastUsernameChange) {
      const oneDay = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
      const lastChange = new Date(user.lastUsernameChange);
      if (now - lastChange < oneDay) {
        return res.status(403).json({ message: 'You can only change your username once per day' });
      }
    }

    user.userName = userName;
    user.lastUsernameChange = now;
    await user.save();

    res.json({ message: 'Username updated successfully', userName: user.userName });
  } catch (err) {
    console.error('Error updating username:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/profile/bio', authMiddleware, async (req, res) => {
  try {
    const { bio } = req.body;

    if (!bio) {
      return res.status(400).json({ message: 'Bio is required' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.bio = bio;
    await user.save();

    res.json({ message: 'Bio updated successfully', bio: user.bio });
  } catch (err) {
    console.error('Error updating bio:', err);
    res.status(500).json({ error: err.message });
  }
});


// Fetch supporters count and user support status
router.get('/supporters', authMiddleware, async (req, res) => {
  try {
    const { username } = req.query;
    console.log('Fetching supporters for username:', username);
    const user = await User.findOne({ userName: username });

    if (!user) {
      console.log('User not found:', username);
      return res.status(404).json({ message: 'User not found' });
    }

    const isUserSupported = user.supportedUsers.includes(req.user.userId);
    res.json({ supportersCount: user.supporters, isUserSupported });
  } catch (err) {
    console.error('Error fetching supporters:', err);
    res.status(500).json({ error: 'Server error, please try again later' });
  }
});

// Toggle support status
router.post('/supporters/toggle', authMiddleware, async (req, res) => {
  try {
    const { username } = req.body;
    console.log('Toggling support for username:', username);
    const user = await User.findOne({ userName: username });

    if (!user) {
      console.log('User not found:', username);
      return res.status(404).json({ message: 'User not found' });
    }

    const userId = req.user.userId;
    const isUserSupported = user.supportedUsers.includes(userId);

    if (isUserSupported) {
      user.supportedUsers.pull(userId);
      user.supporters -= 1;
    } else {
      user.supportedUsers.push(userId);
      user.supporters += 1;
    }

    await user.save();
    res.json({ supportersCount: user.supporters, isSupported: !isUserSupported });
  } catch (err) {
    console.error('Error toggling support status:', err);
    res.status(500).json({ error: 'Server error, please try again later' });
  }
});

module.exports = router;
