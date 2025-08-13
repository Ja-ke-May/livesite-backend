const express = require('express');
const router = express.Router();
const axios = require('axios');

const PROJECT_ID = process.env.XSOLLA_MERCHANT_ID;   
const API_KEY = process.env.MYME_API_KEY;        

const tokenCounts = {
  tokens_400: 400,
  tokens_1000: 1000,
  tokens_2000: 2000,
  tokens_4000: 4000,
  tokens_10000: 10000,
};

// 1. Get OAuth token from Xsolla (CAPI)
async function getOAuthToken() {
  const url = 'https://login.xsolla.com/api/oauth2/token';
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', PROJECT_ID);   
  params.append('client_secret', API_KEY);  

  const res = await axios.post(url, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  return res.data.access_token;
}

// 2. Fetch live SKU data from Store API using OAuth
async function fetchLiveSkuData(sku, oauthToken) {
  try {
    const url = `https://store.xsolla.com/api/v2/project/${PROJECT_ID}/items/virtual_items`;
    const res = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${oauthToken}`,
        'Content-Type': 'application/json',
      },
    });
    const item = res.data.items.find(i => i.sku === sku);
    return item ? {
      sku: item.sku,
      name: item.name,
      price: item.price.amount,
      currency: item.price.currency
    } : null;
  } catch (err) {
    console.error('[ERROR] Failed to fetch SKU from Xsolla:', err.response?.data || err.message);
    return null;
  }
}

// 3. Create payment token
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
    // Get OAuth token once
    const oauthToken = await getOAuthToken();

    console.log('[DEBUG] Fetching live SKU data...');
    const skuData = await fetchLiveSkuData(sku, oauthToken);
    if (!skuData) {
      return res.status(400).json({ error: `SKU '${sku}' not found in Xsolla store` });
    }
    console.log(`[DEBUG] SKU fetched: ${skuData.name} - ${skuData.price} ${skuData.currency}`);

    const payload = {
      user: { id: { value: username } },
      settings: {
        return_url: 'https://myme.live/shop',
        language: 'en'
      },
      purchase: {
        virtual_items: [
          { sku: skuData.sku, quantity: 1 }
        ]
      }
    };
    console.log('[DEBUG] Payload being sent to Xsolla (CAPI):', JSON.stringify(payload, null, 2));

    // Call CAPI to create payment token
    const TOKEN_URL = `https://store.xsolla.com/api/v2/project/${PROJECT_ID}/payment/token`;
    const response = await axios.post(TOKEN_URL, payload, {
      headers: {
        Authorization: `Bearer ${oauthToken}`,
        'Content-Type': 'application/json'
      }
    });

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
