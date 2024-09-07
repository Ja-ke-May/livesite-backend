const mongoose = require('mongoose');

const userLinkAdSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',  // Reference the User model
    required: true
  },
  link: {
    text: {
      type: String,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    imageUrl: {
      type: String,
      default: ''
    },
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'pending'],  // Manage the status of the ad
    default: 'pending'
  },
  tokensSpent: {
    type: Number,
    required: true,  // Number of tokens used for this ad
  },
  displayStart: {
    type: Date,  // When the ad starts being displayed
    default: Date.now,
  },
  displayEnd: {
    type: Date,  // When the ad should stop being displayed (set to one week later)
    default: () => Date.now() + 7 * 24 * 60 * 60 * 1000, // 1 week from creation
  },
  createdAt: {
    type: Date,
    default: Date.now,
  }
});

const UserLinkAd = mongoose.model('UserLinkAd', userLinkAdSchema);

module.exports = UserLinkAd;
