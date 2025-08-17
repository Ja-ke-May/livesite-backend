const User = require('./models/user');
const { sendThankYouEmail } = require('./emails');

/**
 * Handle incoming Square webhook events for payments.
 */
const handleSquareWebhook = async (req, res) => {
  try {
    const event = req.body;

    // Only process payment events
    if (!event.type || !event.type.startsWith('payment.')) {
      console.log('⚠️ Ignored non-payment event:', event.type);
      return res.status(200).send('Ignored');
    }

    const payment = event.data?.object?.payment;

    // Only process completed payments
    if (!payment || payment.status !== 'COMPLETED') {
      console.log('⚠️ Ignored payment not completed:', payment?.status);
      return res.status(200).send('Ignored');
    }

    const sku = payment.note;              // SKU set in checkout link
    const username = payment.reference_id; // Passed from frontend

    if (!username || !sku) {
      console.warn('⚠️ Missing username or SKU in Square payment', { username, sku });
      return res.status(400).send('Missing data');
    }

    // Map SKU to token amount
    const skuMap = {
      tokens_400: 400,
      tokens_1000: 1000,
      tokens_2000: 2000,
      tokens_4000: 4000,
      tokens_10000: 10000,
    };

    const tokens = skuMap[sku];

    if (!tokens) {
      console.warn(`⚠️ Unknown SKU received from Square: ${sku}`);
      return res.status(400).send('Invalid SKU');
    }

    const newPurchase = {
      date: new Date(),
      tokens,
      amountSpent: payment.amount_money?.amount
        ? parseFloat(payment.amount_money.amount) / 100
        : 0,
      currency: payment.amount_money?.currency || 'GBP',
      description: 'Token Purchase',
      paymentId: payment.id || null, // Track Square payment ID
    };

    // Update user in DB
    const user = await User.findOneAndUpdate(
      { username },
      {
        $inc: { tokens },
        $set: { lastPurchaseAmount: newPurchase.amountSpent },
        $push: { purchases: newPurchase },
      },
      { new: true }
    );

    if (!user) {
      console.warn(`⚠️ Webhook received for unknown user: ${username}`);
      return res.status(404).send('User not found');
    }

    // Fire off thank-you email (async, not blocking webhook response)
    sendThankYouEmail(user, newPurchase).catch(err =>
      console.error('❌ Email send error:', err)
    );

    console.log(`✅ ${username} credited ${tokens} tokens (Payment ID: ${payment.id})`);
    res.status(200).send('Processed');

  } catch (err) {
    console.error('❌ Square webhook error:', err);
    res.status(500).send('Server error');
  }
};

module.exports = handleSquareWebhook;
