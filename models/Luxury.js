const mongoose = require('mongoose');

const luxurySchema = new mongoose.Schema({
  index: {
    type: Number,
    required: true,
    default: 5, 
  },
});

module.exports = mongoose.model('Luxury', luxurySchema);
