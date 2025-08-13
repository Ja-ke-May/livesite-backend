const express = require('express');
const router = express.Router();
const axios = require('axios');

const PROJECT_ID = process.env.XSOLLA_PROJECT_ID;
const OAUTH_ACCESS_TOKEN = process.env.XSOLLA_API_KEY; 

const tokenCounts = {
  tokens_400: 400,
  tokens_1000: 1000,
  tokens_2000: 2000,
  tokens_4000: 4000,
  tokens_10000: 10000,
};

router.post('/get-token', async (req, res) => {
  const { username, sku } = req.body;
  console.log('[DEBUG] Incoming request:', req.body);

  if (!username || !sku) {
    return res.status(400).json({ error: 'Missing username or sku' });
  }

  if (!/^[a-zA-Z0-9_\-]+$/.test(username)) {
    return res.status(400).json({ error: 'Invalid username format' });
  }

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
          sku: sku,
          quantity: 1 
        }
      ]
    }
  };

  console.log('[DEBUG] Payload being sent to Xsolla (CAPI):', JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(
      `https://store.xsolla.com/api/v2/project/${PROJECT_ID}/payment/token`,
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
      sku,
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
