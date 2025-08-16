const mongoose = require('mongoose');

const tokenGoalSchema = new mongoose.Schema({
  pot: {
    type: String,
    required: true,
    unique: true
  },
  goal: {
    type: Number,
    required: true,
    min: 1
  },
  currentTokens: {
    type: Number,
    default: 0,
    min: 0
  }
}, { timestamps: true });

module.exports = mongoose.model('TokenGoal', tokenGoalSchema);
