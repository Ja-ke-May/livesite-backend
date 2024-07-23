const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userName: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  dob: {
    type: String,
    required: true
  },
  tokens: {
    type: Number,
    default: 100 
  },
  purchases: {
    type: [String], 
    default: [] 
  },
  profilePicture: {
    type: String, 
    default: ''
  },
  bio: {
    type: String,
    default: ''
  },
  supporters: {
    type: Number,
    default: 0
  },
  links: {
    type: [String], 
    default: []
  },
  results: {
    type: String,
    default: ''
  },
  recentActivity: {
    type: [String], 
    default: []
  },
  strikes: {
    type: Number,
    default: 0
  },
});

const User = mongoose.model('User', userSchema);

module.exports = User;
