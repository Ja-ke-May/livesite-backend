const express = require('express');
const router = express.Router();

const { Client } = require('square');

// Square client setup (always production)
const client = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: 'production',
});

// Map SKUs → amounts (in pennies/cents)
const skuPrices = {
  tokens_400: 999,
  tokens_1000: 1999,
  tokens_2000: 2999,
  tokens_4000: 4999,
  tokens_10000: 9999,
};

// Create checkout link
router.post('/create-checkout', async (req, res) => {
  const { sku, username } = req.body;

  if (!sku || !username) {
    return res.status(400).json({ error: 'Missing SKU or username' });
  }

  const amountCents = skuPrices[sku];
  if (!amountCents) {
    return res.status(400).json({ error: 'Invalid SKU' });
  }

  try {
    const response = await client.checkoutApi.createPaymentLink({
  idempotency_key: Date.now().toString(),
  quick_pay: {
    name: sku,
    price_money: {
      amount: amountCents,
      currency: 'GBP',
    },
    location_id: process.env.SQUARE_LOCATION_ID,
  },
  payment_note: sku,
  reference_id: username,
});


    res.json({ checkoutUrl: response.result.paymentLink.url });
  } catch (err) {
    console.error('Error creating Square checkout:', err);
    res.status(500).json({ error: 'Failed to create checkout' });
  }
});

module.exports = router;
