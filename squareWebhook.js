const User = require('./models/user');
const { sendThankYouEmail } = require('./emails');

const handleSquareWebhook = async (req, res) => {
  try {
    const event = req.body;

    // Only care about payment events
    if (!event.type || !event.type.startsWith('payment.')) {
      return res.status(200).send('Ignored');
    }

    const payment = event.data?.object?.payment;
    if (!payment || payment.status !== 'COMPLETED') {
      return res.status(200).send('Ignored'); // skip pending/failed
    }

    const sku = payment.note;              // set in checkout link
    const userName = payment.reference_id; // passed from frontend

    if (!userName || !sku) {
      console.warn('⚠️ Missing userName or sku in Square payment');
      return res.status(400).send('Missing data');
    }

    // Map SKU → tokens
    let tokens = 0;
    switch (sku) {
      case 'tokens_400': tokens = 400; break;
      case 'tokens_1000': tokens = 1000; break;
      case 'tokens_2000': tokens = 2000; break;
      case 'tokens_4000': tokens = 4000; break;
      case 'tokens_10000': tokens = 10000; break;
      default:
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
    };

    // Update user in DB
    const user = await User.findOneAndUpdate(
      { userName },
      {
        $inc: { tokens },
        $set: { lastPurchaseAmount: newPurchase.amountSpent },
        $push: { purchases: newPurchase },
      },
      { new: true }
    );

    if (!user) {
      console.warn(`⚠️ Webhook received for unknown user: ${userName}`);
      return res.status(404).send('User not found');
    }

    // Fire off email (not blocking response)
    sendThankYouEmail(user, newPurchase).catch(err =>
      console.error('Email send error:', err)
    );

    console.log(`✅ ${userName} purchased ${tokens} tokens via Square.`);
    res.status(200).send('Processed');
  } catch (err) {
    console.error('❌ Square webhook error:', err);
    res.status(500).send('Server error');
  }
};

module.exports = handleSquareWebhook;
