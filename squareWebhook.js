const User = require('./models/user');
const { sendThankYouEmail } = require('./emails');

const skuMap = {
  tokens_400: 400,
  tokens_1000: 1000,
  tokens_2000: 2000,
  tokens_4000: 4000,
  tokens_10000: 10000,
};

const handleSquareWebhook = async (req, res) => {
  try {
    const event = req.body;
    console.log('📬 Incoming Square webhook event:', event.type, event.event_id);

    if (!event.type?.startsWith('payment.')) {
      return res.status(200).send('Ignored');
    }

    const payment = event.data?.object?.payment;
    if (!payment) {
      return res.status(200).send('Ignored');
    }

    console.log('💳 Incoming payment object:', {
      id: payment.id,
      status: payment.status,
    });

    if (payment.status !== 'COMPLETED') {
      return res.status(200).send('Ignored');
    }

    // Try to extract username + sku from the linked order
    let username, sku;
    const order = payment.order; // Square attaches order details inside the payment object

    if (order?.lineItems?.length > 0) {
      const meta = order.lineItems[0].metadata;
      if (meta) {
        username = meta.username;
        sku = meta.sku;
      }
    }

    if (!username || !sku) {
      console.warn('⚠️ Missing username or SKU', { username, sku });
      return res.status(200).send('Ignored');
    }

    const tokens = skuMap[sku];
    if (!tokens) {
      console.warn('⚠️ Invalid SKU:', sku);
      return res.status(200).send('Ignored');
    }

    const amountSpent = payment.amount_money?.amount
      ? payment.amount_money.amount / 100
      : 0;

    const newPurchase = {
      date: new Date(),
      tokens,
      amountSpent,
      currency: payment.amount_money?.currency || 'GBP',
      description: 'Token Purchase',
      paymentId: payment.id,
    };

    // Update user tokens & purchase history
    const user = await User.findOneAndUpdate(
      { username },
      {
        $inc: { tokens },
        $set: { lastPurchaseAmount: amountSpent },
        $push: { purchases: newPurchase },
      },
      { new: true }
    );

    if (!user) {
      console.warn(`⚠️ Unknown user: ${username}`);
      return res.status(200).send('Ignored');
    }

    // Send thank-you email
    sendThankYouEmail(user, newPurchase).catch(err =>
      console.error('❌ Email error:', err)
    );

    console.log(`✅ ${username} credited ${tokens} tokens (Payment ID: ${payment.id})`);
    res.status(200).send('Processed');

  } catch (err) {
    console.error('❌ Square webhook error:', err);
    res.status(500).send('Server error');
  }
};

module.exports = handleSquareWebhook;
