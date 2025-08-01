const mongoose = require('mongoose');

const luxurySchema = new mongoose.Schema({
 index: {
  type: Number,
  required: true,
  default: 5,
  min: 0,
},
  tokenGoal: {
type: Number, 
default: 0,
  },
});

module.exports = mongoose.model('Luxury', luxurySchema);
