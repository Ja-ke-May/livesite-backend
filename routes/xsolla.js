const express = require('express');
const router = express.Router();
const axios = require('axios');

const PROJECT_ID = Number(process.env.XSOLLA_PROJECT_ID);
const MERCHANT_ID = process.env.XSOLLA_MERCHANT_ID;
const OAUTH_ACCESS_TOKEN = process.env.XSOLLA_API_KEY;

const skuMap = {
  tokens_400: { item_id: 1055102, amount: 0.99, tokens: 400 },
  tokens_1000: { item_id: 1055103, amount: 19.99, tokens: 1000 },
  tokens_2000: { item_id: 1055104, amount: 29.99, tokens: 2000 },
  tokens_4000: { item_id: 1055105, amount: 49.99, tokens: 4000 },
  tokens_10000: { item_id: 1055106, amount: 99.99, tokens: 10000 },
};

router.post('/get-token', async (req, res) => {
  const { username, sku } = req.body;

  console.log('[DEBUG] Incoming request:', req.body);

  // Basic validation
  if (!username || !sku) {
    return res.status(400).json({ error: 'Missing username or sku' });
  }
  if (!skuMap[sku]) {
    return res.status(400).json({ error: 'Invalid sku' });
  }
  if (!/^[a-zA-Z0-9_\-]+$/.test(username)) {
    return res.status(400).json({
      error: 'Invalid username format (only letters, numbers, underscore, dash allowed)',
    });
  }

  // Debug SKU map
  console.log('\n[DEBUG] SKU to Item ID Mapping:');
  console.table(
    Object.entries(skuMap).map(([skuName, data]) => ({
      SKU: skuName,
      item_id: data.item_id,
      price: `$${data.amount}`,
      tokens: data.tokens
    }))
  );

  // Xsolla expects this array format
  const payload = {
    user: {
      id: { value: username }
    },
    purchase: {
      virtual_items: [
        {
          sku: sku,       // Use the SKU string ("tokens_400")
          quantity: 1
        }
      ]
    }
  };

  console.log('[DEBUG] Payload being sent to Xsolla:', JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(
      `https://api.xsolla.com/merchant/v2/projects/${PROJECT_ID}/token`,
      payload,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${MERCHANT_ID}:${OAUTH_ACCESS_TOKEN}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('[DEBUG] Xsolla API response:', response.data);

    const { token } = response.data;
    if (!token) {
      return res.status(500).json({ error: 'Failed to get payment token from Xsolla' });
    }

    return res.json({
      paymentUrl: `https://secure.xsolla.com/paystation4/?access_token=${token}`
    });
  } catch (error) {
    console.error('[ERROR] Xsolla CAPI error:', error.response?.data || error.message);
    return res.status(500).json({
      error: 'Failed to create payment token',
      details: error.response?.data || error.message
    });
  }
});

module.exports = router;
