const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('Connected to MongoDB');
    return mongoose.connection.dropCollection('users');
  })
  .then(result => {
    console.log('Collection dropped successfully:', result);
    mongoose.disconnect();
  })
  .catch(err => {
    console.error('Error dropping collection:', err);
    mongoose.disconnect();
  });
