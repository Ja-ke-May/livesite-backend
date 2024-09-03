const express = require('express');
const User = require('../models/user');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/authMiddleware');
const multer = require('multer');

const router = express.Router();
const storage = multer.memoryStorage();
const fileFilter = (req, file, cb) => {
  const validImageTypes = ['image/jpeg', 'image/png', 'image/gif'];
  if (validImageTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, and GIF files are allowed.'), false);
  }
};

const upload = multer({ storage, fileFilter });

router.post('/profile-picture', upload.single('profilePicture'), authMiddleware, async (req, res) => {
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

    user.recentActivity.push(`${user.userName} updated their profile picture`);
    await user.save();

    res.json({ profilePicture: profilePictureBase64 });
  } catch (err) {
    console.error('Error uploading profile picture:', err);
    res.status(500).json({ error: 'Server error, please try again later' });
  }
});

router.post('/signup', async (req, res) => {
  try {
    const { userName, email, password, dob, marketingConsent } = req.body;

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
      marketingConsent: marketingConsent || false, 
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

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET,);

    // { expiresIn: '72h' } 

    res.json({ message: 'Login successful', token, username: user.userName }); // Return the username
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

// Fetch user profile
router.get('/profile/:username', authMiddleware, async (req, res) => {
  try {
    const { username } = req.params;
    const user = await User.findOne({ userName: username }).select('-password -otherUnnecessaryFields'); 
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).json({ message: 'Server error, please try again later' });
  }
});

// Update username
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
    user.recentActivity.push(`${user.userName} updated their bio`);
    await user.save();

    res.json({ message: 'Bio updated successfully', bio: user.bio });
  } catch (err) {
    console.error('Error updating bio:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/supporters', authMiddleware, async (req, res) => {
  try {
    const { username } = req.query;
    const user = await User.findOne({ userName: username });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isUserSupported = user.supportedUsers.includes(req.user.userId);
    res.json({ supportersCount: user.supporters, isUserSupported });
  } catch (err) {
    console.error('Error fetching supporters:', err);
    res.status(500).json({ error: 'Server error, please try again later' });
  }
});

router.post('/supporters/toggle', authMiddleware, async (req, res) => {
  try {
    const { username } = req.body;
    const user = await User.findOne({ userName: username });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const userId = req.user.userId;
    const supporter = await User.findById(userId);

    if (!supporter) {
      return res.status(404).json({ message: 'Supporter not found' });
    }

    const isUserSupported = user.supportedUsers.includes(userId);

    if (isUserSupported) {
      user.supportedUsers.pull(userId);
      user.supporters -= 1;
    } else {
      user.supportedUsers.push(userId);
      user.supporters += 1;
      user.recentActivity.push(`${supporter.userName} supported ${user.userName}`);
      supporter.recentActivity.push(`${supporter.userName} supported ${user.userName}`);
    }

    await user.save();
    await supporter.save();

    res.json({ supportersCount: user.supporters, isSupported: !isUserSupported });
  } catch (err) {
    console.error('Error toggling support status:', err);
    res.status(500).json({ error: 'Server error, please try again later' });
  }
});

// Add a new link
router.post('/profile/link', upload.single('image'), authMiddleware, async (req, res) => {
  try {
    const { text, url } = req.body;
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let imageUrl = '';
    if (req.file) {
      imageUrl = req.file.buffer.toString('base64');
    }

    user.links.push({ text, url, imageUrl });
    user.recentActivity.push(`${user.userName} added a new link: ${text}`);
    await user.save();

    res.json(user.links);
  } catch (err) {
    console.error('Error adding link:', err);
    res.status(500).json({ error: 'Server error, please try again later' });
  }
});

// Delete a link
router.delete('/profile/link/:linkId', authMiddleware, async (req, res) => {
  try {
    const { linkId } = req.params;
    const userId = req.user.userId;

    console.log(`Attempting to delete link with ID: ${linkId} for user: ${userId}`);

    const user = await User.findById(userId);

    if (!user) {
      console.log(`User not found: ${userId}`);
      return res.status(404).json({ message: 'User not found' });
    }

    const linkIndex = user.links.findIndex(link => link._id.toString() === linkId);
    if (linkIndex === -1) {
      console.log(`Link not found: ${linkId}`);
      return res.status(404).json({ message: 'Link not found' });
    }

    user.links.splice(linkIndex, 1); // Remove the link
    await user.save();

    console.log(`Link deleted successfully: ${linkId}`);
    res.json(user.links);
  } catch (err) {
    console.error('Error deleting link:', err);
    res.status(500).json({ error: 'Server error, please try again later' });
  }
});

// Fetch recent activity
router.get('/recent-activity/:username', authMiddleware, async (req, res) => {
  try {
    const { username } = req.params;
    const user = await User.findOne({ userName: username });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user.recentActivity);
  } catch (err) {
    console.error('Error fetching recent activity:', err);
    res.status(500).json({ error: 'Server error, please try again later' });
  }
});

router.post('/send-tokens', authMiddleware, async (req, res) => {
  try {
    console.log("Request body:", req.body);
    const { recipientUsername, tokenAmount } = req.body;

    if (!recipientUsername || !tokenAmount || tokenAmount <= 0) {
      console.log("Validation failed:", { sender, recipientUsername, tokenAmount });
      return res.status(400).json({ message: 'Recipient username and a valid token amount are required' });
    }

    const sender = await User.findById(req.user.userId);
    const recipient = await User.findOne({ userName: recipientUsername });

    if (!sender) {
      console.log("Sender not found:", req.user.userId);
      return res.status(404).json({ message: 'Sender not found' });
    }
    if (!recipient) {
      console.log("Recipient not found:", sender,  recipientUsername);
      return res.status(404).json({ message: 'Recipient not found' });
    }

    if (sender.userName === recipient.userName) {
      console.log("Sender and recipient are the same:", sender.userName);
      return res.status(400).json({ message: 'You cannot send tokens to yourself' });
    }
    

    if (sender.tokens < tokenAmount) {
      console.log("Insufficient tokens:", sender.tokens, tokenAmount);
      return res.status(400).json({ message: 'Insufficient tokens' });
    }

    sender.tokens -= tokenAmount;
    recipient.tokens += tokenAmount;

    sender.recentActivity.push(`Sent ${tokenAmount} tokens to ${recipient.userName}`);
    recipient.recentActivity.push(`Received ${tokenAmount} tokens from ${sender.userName}`);

    await sender.save();
    await recipient.save();

    res.json({ message: `Successfully transferred ${tokenAmount} tokens to ${recipient.userName}` });
  } catch (err) {
    console.error('Error transferring tokens:', err);
    res.status(500).json({ error: 'Server error, please try again later' });
  }
});

// Deduct tokens
router.post('/deduct-tokens', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'A valid token amount is required' });
    }

    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.tokens < amount) {
      return res.status(400).json({ message: 'Insufficient tokens' });
    }

    user.tokens -= amount;
    

    await user.save();

    res.json({ message: `Successfully deducted ${amount} tokens`, tokens: user.tokens });
  } catch (err) {
    console.error('Error deducting tokens:', err);
    res.status(500).json({ error: 'Server error, please try again later' });
  }
});

// Award tokens to a user
router.post('/award-tokens', authMiddleware, async (req, res) => {
  try {
    const { username, amount } = req.body;

    if (!username || !amount || amount <= 0) {
      return res.status(400).json({ message: 'Username and a valid token amount are required' });
    }

    const user = await User.findOne({ userName: username });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.tokens += amount;
    user.recentActivity.push(`Received ${amount} tokens`);

    await user.save();

    res.json({ message: `Successfully awarded ${amount} tokens to ${username}`, tokens: user.tokens });
  } catch (err) {
    console.error('Error awarding tokens:', err);
    res.status(500).json({ error: 'Server error, please try again later' });
  }
});

// Update live duration
router.post('/profile/live-duration', authMiddleware, async (req, res) => {
  try {
    const { username, liveDuration } = req.body;

    // Log the incoming request data
    console.log('Received request to update live duration:', { username, liveDuration });

    if (!username || !liveDuration || liveDuration < 0) {
      console.log('Invalid data received:', { username, liveDuration });
      return res.status(400).json({ message: 'Username and a valid live duration are required' });
    }

    const user = await User.findOne({ userName: username });

    if (!user) {
      console.log('User not found:', username);
      return res.status(404).json({ message: 'User not found' });
    }

    // Log the current durations before updating
    console.log('Current user durations:', {
      totalLiveDuration: user.totalLiveDuration,
      longestLiveDuration: user.longestLiveDuration,
    });

    // Update total live duration
    user.totalLiveDuration = (user.totalLiveDuration || 0) + liveDuration;

    // Check and update the longest live duration
    if (liveDuration > user.longestLiveDuration) {
      user.longestLiveDuration = liveDuration;
    }

    await user.save();

    // Log the updated durations after saving
    console.log('Updated user durations:', {
      totalLiveDuration: user.totalLiveDuration,
      longestLiveDuration: user.longestLiveDuration,
    });

    res.json({ 
      message: `Successfully updated live duration for ${username}`, 
      totalLiveDuration: user.totalLiveDuration,
      longestLiveDuration: user.longestLiveDuration
    });
  } catch (err) {
    console.error('Error updating live duration:', err);
    res.status(500).json({ error: 'Server error, please try again later' });
  }
});

router.put('/comment/color', authMiddleware, async (req, res) => {
  try {
    const { username, colorType, color } = req.body;

    if (!username || !colorType || !color) {
      return res.status(400).json({ message: 'Username, color type, and color are required' });
    }

    // Find the user by username
    const user = await User.findOne({ userName: username });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let activityMessage = '';

    // Update the user's color based on the color type
    if (colorType === 'commentColor') {
      user.commentColor = color;
      activityMessage = `${user.userName} changed their comment color to ${color}`;
    } else if (colorType === 'borderColor') {
      user.borderColor = color;
      activityMessage = `${user.userName} changed their border color to ${color}`;
    } else if (colorType === 'usernameColor') {
      user.usernameColor = color;
      activityMessage = `${user.userName} changed their username color to ${color}`;
    } else {
      return res.status(400).json({ message: 'Invalid color type' });
    }

    // Add to recent activity
    if (activityMessage) {
      user.recentActivity.push(activityMessage);
    }

    await user.save();

    res.json({ message: 'Color updated successfully', user });
  } catch (err) {
    console.error('Error updating color:', err);
    res.status(500).json({ error: 'Server error, please try again later' });
  }
});

router.post('/update-purchase', async (req, res) => {
  const { username, tokens, amountSpent, currency, description } = req.body;

  try {
      const user = await User.findOne({ userName: username });
      if (!user) {
          return res.status(404).json({ message: 'User not found' });
      }

      user.tokens += tokens;

      const purchaseDetails = {
          date: new Date(),
          tokens,
          amountSpent,
          currency,
          description
      };
      user.purchases.push(purchaseDetails);

      await user.save();

      res.json({ message: 'Purchase updated successfully', user });
  } catch (error) {
      console.error('Error updating purchase:', error);
      res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
