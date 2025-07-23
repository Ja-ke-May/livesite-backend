const User = require('./models/user');
const { sendThankYouEmail } = require('./emails');

const handleXsollaWebhook = async (req, res) => {
  const event = req.body;

  if (event.notification_type !== 'payment') {
    return res.status(200).send('Ignored');
  }

  const userName = event.user?.id;
  const sku = event.purchase?.virtual_items?.items?.[0]?.sku;

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
    amountSpent: parseFloat(event.purchase.total.amount),
    currency: event.purchase.total.currency,
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

    res.status(200).send('Processed');
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).send('Server error');
  }
};

module.exports = handleXsollaWebhook;
