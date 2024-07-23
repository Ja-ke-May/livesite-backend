const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const bodyParser = require('body-parser'); // Import body-parser
const helmet = require('helmet'); // For security
const rateLimit = require('express-rate-limit'); // For rate limiting
const userRoutes = require('./routes/userRoutes'); // Adjust path as necessary

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(helmet());
app.use(bodyParser.json());

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Database Connection
mongoose.connect(process.env.MONGODB_URI, {})
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Could not connect to MongoDB', err));

// Use Routes
app.use('/api', userRoutes);

// Start Server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
