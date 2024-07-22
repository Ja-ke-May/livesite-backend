// models/user.js

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userName: String,
  signUpEmail: {
    type: String,
    required: [true, 'Email is required'],
    unique: true
  },
  signUpPassword: String,
  dob: String
});

const User = mongoose.model('User', userSchema);

module.exports = User;
