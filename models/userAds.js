const mongoose = require('mongoose');

const userAdsSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
  },
  links: {
    type: [
      {
        text: {
          type: String,
          required: true,
        },
        url: {
          type: String,
          required: true,
        },
        imageUrl: {
          type: String, // Base64 string for the image
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
          expires: '60s', // TTL (Time-to-Live) index for automatic removal after 7 days 7d
        }
      }
    ],
    validate: [arrayLimit, '{PATH} exceeds the limit of 20'], // Validate that there are no more than 20 links
  }
});

// Custom validator to ensure only 20 link objects can be stored
function arrayLimit(val) {
  return val.length <= 20;
}

const UserAds = mongoose.model('UserAds', userAdsSchema);

module.exports = UserAds;
