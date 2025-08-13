const express = require('express');
const router = express.Router();
const axios = require('axios');

// Env vars
const PROJECT_ID = process.env.XSOLLA_PROJECT_ID;
const OAUTH_ACCESS_TOKEN = process.env.XSOLLA_API_KEY; // CAPI token (Bearer auth)

// Optional token mapping (for your own DB tracking)
const tokenCounts = {
  tokens_400: 400,
  tokens_1000: 1000,
  tokens_2000: 2000,
  tokens_4000: 4000,
  tokens_10000: 10000,
};

// Helper: Fetch live SKU details from Xsolla store
async function fetchLiveSkuData(sku) {
  try {
    const url = `https://store.xsolla.com/api/v2/project/${PROJECT_ID}/items/virtual_items`;
    const res = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${OAUTH_ACCESS_TOKEN}`, // ✅ CAPI uses Bearer
        'Content-Type': 'application/json',
      },
    });

    if (!res.data?.items) return null;

    const item = res.data.items.find(i => i.sku === sku);
    if (!item) return null;

    return {
      sku: item.sku,
      name: item.name,
      price: item.price.amount,
      currency: item.price.currency
    };

  } catch (err) {
    console.error('[ERROR] Failed to fetch SKU from Xsolla:', err.response?.data || err.message);
    return null;
  }
}

// Route: Create payment token
router.post('/get-token', async (req, res) => {
  const { username, sku } = req.body;
  console.log('[DEBUG] Incoming request:', req.body);

  if (!username || !sku) {
    return res.status(400).json({ error: 'Missing username or sku' });
  }
  if (!/^[a-zA-Z0-9_\-]+$/.test(username)) {
    return res.status(400).json({ error: 'Invalid username format' });
  }

  console.log('[DEBUG] Fetching live SKU data...');
  const skuData = await fetchLiveSkuData(sku);
  if (!skuData) {
    return res.status(400).json({ error: `SKU '${sku}' not found in Xsolla store` });
  }

  console.log(`[DEBUG] SKU fetched: ${skuData.name} - ${skuData.price} ${skuData.currency}`);

  const payload = {
    user: {
      id: { value: username }
    },
    settings: {
      return_url: 'https://myme.live/shop',
      language: 'en'
    },
    purchase: {
      virtual_items: [
        {
          sku: skuData.sku,
          quantity: 1
        }
      ]
    }
  };

  console.log('[DEBUG] Payload being sent to Xsolla (CAPI):', JSON.stringify(payload, null, 2)); 

  const TOKEN_URL = `https://api.xsolla.com/merchant/v2/projects/${PROJECT_ID}/payment/token`;



  try {
    const response = await axios.post(
  TOKEN_URL,
  payload,
  {
    headers: {
      Authorization: `Bearer ${OAUTH_ACCESS_TOKEN}`, 
      'Content-Type': 'application/json'
    }
  }
);

    console.log('[DEBUG] Xsolla API response:', response.data);

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
    console.error('[ERROR] Xsolla API error:', error.response?.data || error.message);
    return res.status(500).json({
      error: 'Failed to create payment token',
      details: error.response?.data || error.message
    });
  }
});

module.exports = router;
