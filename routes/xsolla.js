const express = require('express');
const router = express.Router();
const axios = require('axios');

const PROJECT_ID = process.env.XSOLLA_PROJECT_ID; 
const MERCHANT_API_KEY = process.env.XSOLLA_API_KEY;
const XSOLLA_MERCHANT_ID = process.env.XSOLLA_MERCHANT_ID; 

const skuMap = {
  tokens_400: { amount: 0.99, tokens: 400 },
  tokens_1000: { amount: 19.99, tokens: 1000 },
  tokens_2000: { amount: 29.99, tokens: 2000 },
  tokens_4000: { amount: 49.99, tokens: 4000 },
  tokens_10000: { amount: 99.99, tokens: 10000 },
};

router.post('/get-token', async (req, res) => {
  const { username, sku } = req.body;

  if (!username || !sku) {
    return res.status(400).json({ error: 'Missing username or sku' });
  }

  const purchase = skuMap[sku];
  if (!purchase) {
    return res.status(400).json({ error: 'Invalid sku' });
  }

  try {
    const payload = {
      user: {
        id: String(username), // user id as string
      },
      settings: {
        locale: "en",
        currency: "GBP",
        project_id: Number(PROJECT_ID),
      },
      purchase: {
        virtual_items: [
          {
            sku: sku,
            quantity: 1
          }
        ],
        price: purchase.amount,
        currency: "GBP"
      }
    };

    const authHeader = `Basic ${Buffer.from(`${XSOLLA_MERCHANT_ID}:${MERCHANT_API_KEY}`).toString('base64')}`;

    const response = await axios.post(
      `https://api.xsolla.com/merchant/v2/merchants/${XSOLLA_MERCHANT_ID}/token`,
      payload,
      {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        }
      }
    );

    const { token } = response.data;

    if (!token) {
      return res.status(500).json({ error: 'Failed to get payment token from Xsolla' });
    }

    const paymentUrl = `https://secure.xsolla.com/paystation2/?access_token=${token}`;

    return res.json({ paymentUrl });

  } catch (error) {
    console.error('Xsolla API error:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Failed to create payment token' });
  }
});


module.exports = router;
