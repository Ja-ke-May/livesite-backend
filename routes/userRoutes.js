const express = require('express');
const User = require('../models/user');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');

router.post('/signup', async (req, res) => {
    try {
      console.log('Request body:', req.body); // Add this line
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
  

// Login Route
router.post('/login', async (req, res) => {
    console.log('Login request body:', req.body);
    try {
      const { email, password } = req.body;
  
      if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
      }
  
      // Normalize email to lowercase
      const normalizedEmail = email.toLowerCase();
      const user = await User.findOne({ email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') } });
  
      if (!user) {
        console.log('No account with this email');
        return res.status(401).json({ message: 'No account with this email' });
      }
  
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        console.log('Password incorrect');
        return res.status(401).json({ message: 'Password incorrect' });
      }
  
      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  
      res.json({ message: 'Login successful', token });
    } catch (err) {
      console.error('Error during login:', err);
      res.status(500).json({ error: err.message });
    }
  });  

// Check Username Route
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

// Get User Profile
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

module.exports = router;
