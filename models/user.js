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
    default: 1000 
  },
  purchases: {
    type: [purchaseSchema],
    default: [],
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
  supportedUsers: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'User',
    default: []
  },
  links: [{
    text: String,
    url: String,
    imageUrl: String,
  }],
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
  lastUsernameChange: {
    type: Date,
    default: null
  },
  totalLiveDuration: {
    type: Number,
    default: 0  
  },
  longestLiveDuration: {
    type: Number,
    default: 0  
  },
  commentColor: {
    type: String,
    default: '#ffffff' 
  },
  borderColor: {
    type: String,
    default: '#000110'  
  },
  usernameColor: {
    type: String,
    default: '#ffffff' 
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const User = mongoose.model('User', userSchema);

module.exports = User;
