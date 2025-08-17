const User = require('./models/user');
const PaymentLink = require('./models/paymentLink');
const { sendThankYouEmail } = require('./emails');

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
    console.log('💳 Incoming payment object:', {
      id: payment?.id,
      status: payment?.status,
      reference_id: payment?.reference_id,
      note: payment?.note,
      metadata: payment?.metadata
    });

    if (!payment || payment.status !== 'COMPLETED') {
      console.log('⚠️ Ignored payment not completed:', payment?.status);
      return res.status(200).send('Ignored');
    }

    // Extract username and SKU
    let username, sku;
    if (payment.reference_id) {
      const parts = payment.reference_id.split('|');
      if (parts.length === 2) {
        username = parts[0];
        sku = parts[1];
        console.log('📝 Extracted username/sku from reference_id:', { username, sku });
      }
    }
    if ((!username || !sku) && payment.metadata) {
      username = payment.metadata.username || username;
      sku = payment.metadata.sku || sku;
    }
    if ((!username || !sku) && payment.note) {
      try {
        const parsed = JSON.parse(payment.note);
        username = parsed.username || username;
        sku = parsed.sku || sku;
      } catch {}
    }
    if (!username || !sku) {
      console.warn('⚠️ Missing username or SKU in Square payment', { username, sku });
      return res.status(200).send('Ignored');
    }

    const skuMap = {
      tokens_400: 400,
      tokens_1000: 1000,
      tokens_2000: 2000,
      tokens_4000: 4000,
      tokens_10000: 10000,
    };
    const tokens = skuMap[sku];
    if (!tokens) return res.status(200).send('Ignored');

    const newPurchase = {
      date: new Date(),
      tokens,
      amountSpent: payment.amount_money?.amount ? parseFloat(payment.amount_money.amount) / 100 : 0,
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
        $set: { lastPurchaseAmount: newPurchase.amountSpent },
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
      { linkId: payment.id },
      { isPaid: true, paidAt: new Date() }
    );

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
