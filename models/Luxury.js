const mongoose = require('mongoose');

const luxurySchema = new mongoose.Schema({
  index: {
    type: Number,
    required: true,
    default: 5, 
  },
  votePurchasedBy: {
    type: String,
  },
  time: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Luxury', luxurySchema);
