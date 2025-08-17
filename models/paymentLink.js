const mongoose = require('mongoose');

const paymentLinkSchema = new mongoose.Schema({
  linkId: { type: String, required: true, unique: true }, 
  username: { type: String, required: true },
  sku: { type: String, required: true },
  isPaid: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  paidAt: { type: Date },
});

module.exports = mongoose.model('PaymentLink', paymentLinkSchema);
