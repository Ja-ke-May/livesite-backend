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
  }
});



const UserAds = mongoose.model('UserAds', userAdsSchema);

module.exports = UserAds;
