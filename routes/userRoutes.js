const express = require('express');
const User = require('../models/user');
const bcrypt = require('bcrypt');
const router = express.Router();

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
            dob
        });

        await user.save();

        res.status(201).json({ message: 'User created successfully' });
    } catch (err) {
        console.error('Error during signup:', err);
        res.status(500).json({ error: err.message });
    }
});


// check if username is available
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


module.exports = router;
