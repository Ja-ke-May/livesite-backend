const User = require('./models/user');
const { sendThankYouEmail } = require('./emails');

const handleSquareWebhook = async (req, res) => {
  const event = req.body;

  // Only care about payment.created/updated events
  if (!event.type || !event.type.startsWith('payment.')) {
    return res.status(200).send('Ignored');
  }

  const payment = event.data?.object?.payment;

  if (!payment || payment.status !== 'COMPLETED') {
    return res.status(200).send('Ignored'); // skip pending/canceled
  }

  const sku = payment.note;           // we’ll save SKU in "note" when checkout is created
  const userName = payment.reference_id; // username passed from frontend → backend → Square

  if (!userName || !sku) return res.status(400).send('Missing data');

  let tokens = 0;
  switch (sku) {
    case 'tokens_400': tokens = 400; break;
    case 'tokens_1000': tokens = 1000; break;
    case 'tokens_2000': tokens = 2000; break;
    case 'tokens_4000': tokens = 4000; break;
    case 'tokens_10000': tokens = 10000; break;
    default:
      console.warn(`Unknown SKU: ${sku}`);
      return res.status(400).send('Invalid SKU');
  }

  const newPurchase = {
    date: new Date(),
    tokens,
    amountSpent: parseFloat(payment.amount_money.amount) / 100, // Square reports in cents
    currency: payment.amount_money.currency,
    description: 'Token Purchase'
  };

  try {
    const user = await User.findOneAndUpdate(
      { userName },
      {
        $inc: { tokens },
        $set: { lastPurchaseAmount: newPurchase.amountSpent },
        $push: { purchases: newPurchase }
      },
      { new: true }
    );

    if (!user) return res.status(404).send('User not found');

    await sendThankYouEmail(user, newPurchase);

    console.log(`✅ ${userName} purchased ${tokens} tokens via Square.`);

    res.status(200).send('Processed');
  } catch (err) {
    console.error('Square webhook error:', err);
    res.status(500).send('Server error');
  }
};

module.exports = handleSquareWebhook;
