const express = require('express');
const router = express.Router();
const TokenGoal = require('../models/tokenGoal');
const authMiddleware = require('../middleware/authMiddleware');

// Fetch a token goal by pot name
router.get('/:pot', async (req, res) => {
  try {
    const goal = await TokenGoal.findOne({ pot: req.params.pot });
    if (!goal) {
      return res.status(404).json({ message: 'Token goal not found' });
    }
    res.json(goal);
  } catch (err) {
    console.error('Error fetching token goal:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a token goal (admin only)
router.post('/', authMiddleware, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const { pot, goal } = req.body;
    if (!pot || !goal || goal < 1) {
      return res.status(400).json({ message: 'Pot name and valid goal are required' });
    }

    const newGoal = new TokenGoal({ pot, goal });
    await newGoal.save();

    res.status(201).json(newGoal);
  } catch (err) {
    console.error('Error creating token goal:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add tokens to a pot
router.post('/:pot/add', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    const potName = req.params.pot;

    if (!amount || amount < 1) {
      return res.status(400).json({ message: 'Amount must be at least 1' });
    }

    const goalDoc = await TokenGoal.findOne({ pot: potName });
    if (!goalDoc) {
      return res.status(404).json({ message: 'Token goal not found' });
    }

    const remaining = goalDoc.goal - goalDoc.currentTokens;
    if (amount > remaining) {
      return res.status(400).json({ message: `You can only add up to ${remaining} tokens` });
    }

    goalDoc.currentTokens += amount;
    await goalDoc.save();

    res.json({ 
      message: 'Tokens added successfully', 
      currentTokens: goalDoc.currentTokens, 
      goal: goalDoc.goal 
    });
  } catch (err) {
    console.error('Error adding tokens:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
