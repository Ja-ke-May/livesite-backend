const User = require('./models/user');
const PaymentLink = require('./models/paymentLink');
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

    // Only process payment events
    if (!event.type || !event.type.startsWith('payment.')) {
      console.log('⚠️ Ignored non-payment event:', event.type);
      return res.status(200).send('Ignored');
    }

    const payment = event.data?.object?.payment;
    if (!payment) return res.status(200).send('Ignored');

    console.log('💳 Incoming payment object:', {
      id: payment.id,
      status: payment.status,
      amount: payment.amount_money,
    });

    // Only handle completed payments
    if (payment.status !== 'COMPLETED') {
      console.log('⚠️ Ignored payment not completed:', payment.status);
      return res.status(200).send('Ignored');
    }

    // Lookup PaymentLink to get username and SKU
    const paymentLink = await PaymentLink.findOne({
      $or: [{ linkId: payment.id }, { orderId: payment.order_id }]
    });

    if (!paymentLink) {
      console.warn('⚠️ Could not find PaymentLink for payment', payment.id);
      return res.status(200).send('Ignored');
    }

    const { username, sku } = paymentLink;
    if (!username || !sku || !skuMap[sku]) {
      console.warn('⚠️ Invalid username or SKU from PaymentLink', { username, sku });
      return res.status(200).send('Ignored');
    }

    const tokens = skuMap[sku];
    const amountSpent = payment.amount_money?.amount ? payment.amount_money.amount / 100 : 0;
    const newPurchase = {
      date: new Date(),
      tokens,
      amountSpent,
      currency: payment.amount_money?.currency || 'GBP',
      description: 'Token Purchase',
      paymentId: payment.id,
    };

    console.log('💰 Processing purchase for user:', username, newPurchase);

    // Update User tokens and purchase history
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
      console.warn(`⚠️ Webhook received for unknown user: ${username}`);
      return res.status(200).send('Ignored');
    }

    // Mark PaymentLink as paid
    await PaymentLink.findOneAndUpdate(
      { $or: [{ linkId: payment.id }, { orderId: payment.order_id }] },
      { isPaid: true, paidAt: new Date() }
    );

    // Send thank-you email
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
