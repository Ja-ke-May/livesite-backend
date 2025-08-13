const express = require('express');
const router = express.Router();
const axios = require('axios');

const PROJECT_ID = process.env.XSOLLA_PROJECT_ID;
const MERCHANT_ID = process.env.XSOLLA_MERCHANT_ID;
const API_KEY = process.env.XSOLLA_API_KEY;

const tokenCounts = {
  tokens_400: 400,
  tokens_1000: 1000,
  tokens_2000: 2000,
  tokens_4000: 4000,
  tokens_10000: 10000,
};

// Fetch SKU details from Merchant API instead of CAPI
async function fetchSkuData(sku) {
  try {
    const url = `https://api.xsolla.com/merchant/v2/projects/${PROJECT_ID}/virtual_items`;
    const res = await axios.get(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${MERCHANT_ID}:${API_KEY}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
    });
    const item = res.data.items.find(i => i.sku === sku);
    return item
      ? { sku: item.sku, name: item.name, price: item.price.amount, currency: item.price.currency }
      : null;
  } catch (err) {
    console.error('[ERROR] Failed to fetch SKU from Merchant API:', err.response?.data || err.message);
    return null;
  }
}

router.post('/get-token', async (req, res) => {
  const { username, sku } = req.body;
  console.log('[DEBUG] Incoming request:', req.body);

  if (!username || !sku) {
    return res.status(400).json({ error: 'Missing username or sku' });
  }
  if (!/^[a-zA-Z0-9_\-]+$/.test(username)) {
    return res.status(400).json({ error: 'Invalid username format' });
  }

  try {
    const skuData = await fetchSkuData(sku);
    if (!skuData) {
      return res.status(400).json({ error: `SKU '${sku}' not found` });
    }
    console.log(`[DEBUG] SKU fetched: ${skuData.name} - ${skuData.price} ${skuData.currency}`);

    const payload = {
      user: { id: { value: username } },
      purchase: {
        virtual_items: [
          { sku: skuData.sku, quantity: 1 }
        ]
      },
      settings: {
        return_url: 'https://myme.live/shop',
        language: 'en'
      }
    };
    console.log('[DEBUG] Payload to Merchant API:', JSON.stringify(payload, null, 2));

    const TOKEN_URL = `https://api.xsolla.com/merchant/v2/projects/${PROJECT_ID}/token`;
    const response = await axios.post(TOKEN_URL, payload, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${MERCHANT_ID}:${API_KEY}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('[DEBUG] Merchant API response:', response.data);

    const { token } = response.data;
    if (!token) {
      return res.status(500).json({ error: 'Failed to get payment token from Xsolla' });
    }

    const paymentUrl = `https://secure.xsolla.com/paystation4/?token=${token}`;
    return res.json({
      paymentUrl,
      sku: skuData.sku,
      price: skuData.price,
      currency: skuData.currency,
      tokens: tokenCounts[sku] || null
    });

  } catch (error) {
    console.error('[ERROR] Merchant API error:', error.response?.data || error.message);
    return res.status(500).json({
      error: 'Failed to create payment token',
      details: error.response?.data || error.message
    });
  }
});

module.exports = router;
