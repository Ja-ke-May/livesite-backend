const express = require('express');
const router = express.Router();
const axios = require('axios');

// Env vars
const PROJECT_ID = Number(process.env.XSOLLA_PROJECT_ID);
const MERCHANT_ID = process.env.XSOLLA_MERCHANT_ID;
const OAUTH_ACCESS_TOKEN = process.env.XSOLLA_API_KEY;

// Optional token mapping (only if you need to track token count for your own DB)
const tokenCounts = {
  tokens_400: 400,
  tokens_1000: 1000,
  tokens_2000: 2000,
  tokens_4000: 4000,
  tokens_10000: 10000,
};

// Helper: Fetch live SKU details from Xsolla
async function fetchLiveSkuData(sku) {
  try {
    const url = `https://store.xsolla.com/api/v2/project/${PROJECT_ID}/items/virtual_items`;
    const res = await axios.get(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${MERCHANT_ID}:${OAUTH_ACCESS_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.data?.items) return null;

    const item = res.data.items.find(i => i.sku === sku);
    if (!item) return null;

    // Convert to minor units (Xsolla expects cents)
    const amountMinor = Math.round(item.price.amount * 100);

    return {
      sku: item.sku,
      amount: amountMinor,
      name: item.name,
      price: item.price.amount,
      currency: item.price.currency,
    };

  } catch (err) {
    console.error('[ERROR] Failed to fetch SKU from Xsolla:', err.response?.data || err.message);
    return null;
  }
}

router.post('/get-token', async (req, res) => {
  const { username, sku } = req.body;

  console.log('[DEBUG] Incoming request:', req.body);

  // Basic validation
  if (!username || !sku) {
    return res.status(400).json({ error: 'Missing username or sku' });
  }
  if (!/^[a-zA-Z0-9_\-]+$/.test(username)) {
    return res.status(400).json({ error: 'Invalid username format' });
  }

  // Get live SKU details
  console.log('[DEBUG] Fetching SKU data from live Xsolla store...');
  const skuData = await fetchLiveSkuData(sku);
  if (!skuData) {
    return res.status(400).json({ error: `SKU '${sku}' not found in live Xsolla store` });
  }

  console.log(`[DEBUG] Live SKU price: ${skuData.price} ${skuData.currency} (${skuData.amount} in minor units)`);

 const payload = {
  user: {
    id: { value: username }
  },
  purchase: {
    virtual_items: {
      items: [
        {
          sku: skuData.sku,
          amount: skuData.amount
        }
      ],
      currency: skuData.currency 
    }
  }
};

  console.log('[DEBUG] Payload being sent to Xsolla:', JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(
      `https://api.xsolla.com/api/v2/projects/${PROJECT_ID}/token`,
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
