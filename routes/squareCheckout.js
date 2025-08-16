const express = require('express');
const router = express.Router();
const { Client, Environment } = require('square');

// Square client setup
const client = new Client({
  environment: process.env.SQUARE_ENV,
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
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
      idempotencyKey: Date.now().toString(),
      quickPay: {
        name: sku,
        priceMoney: {
          amount: amountCents,
          currency: 'GBP', // change if needed
        },
        locationId: process.env.SQUARE_LOCATION_ID,
      },
      paymentNote: sku,      // so webhook can award correct tokens
      referenceId: username, // so webhook knows which user
    });

    res.json({ checkoutUrl: response.result.paymentLink.url });
  } catch (err) {
    console.error('Error creating Square checkout:', err);
    res.status(500).json({ error: 'Failed to create checkout' });
  }
});

module.exports = router;
