// routes/userRoutes.js

const express = require('express');
const User = require('../models/user');
const router = express.Router();

router.post('/signup', async (req, res) => {
    try {
        const { userName, signUpEmail, signUpPassword, dob } = req.body;

        if (!userName || !signUpEmail || !signUpPassword || !dob) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        // Create a new user
        const user = new User({
            userName,
            signUpEmail,
            signUpPassword,
            dob
        });

        // Save user to the database
        await user.save();
        
        res.status(201).json({ message: 'User created successfully' });
    } catch (err) {
        if (err.code === 11000) { // MongoDB duplicate key error code
            return res.status(400).json({ message: 'Email already exists' });
        }
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
