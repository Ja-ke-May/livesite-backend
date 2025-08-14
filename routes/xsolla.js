// routes/xsolla.js
const express = require('express');
const axios = require('axios');

const router = express.Router();

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

  try {
    const payload = {
      user: {
        id: { value: username }
      },
      purchase: {
        virtual_items: {
          items: [
            {
              sku: sku,
              amount: 1
            }
          ]
        }
      },
      settings: {
        return_url: 'https://myme.live/shop',
        language: 'en'
      }
    };

    // Correct CAPI token endpoint
    const TOKEN_URL = `https://api.xsolla.com/merchant/v2/projects/${process.env.XSOLLA_PROJECT_ID}/token`;

    // API Key auth (username = API key, password = empty)
    const response = await axios.post(TOKEN_URL, payload, {
      auth: {
        username: process.env.MYME_API_KEY,
        password: ''
      },
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const { token } = response.data;
    if (!token) throw new Error('No payment token received');

    return res.json({
      paymentUrl: `https://secure.xsolla.com/paystation4/?token=${token}`,
      sku,
      tokens: tokenCounts[sku] || null
    });

  } catch (error) {
    console.error('[ERROR] CAPI API error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to create payment token',
      details: error.response?.data || error.message
    });
  }
});

module.exports = router;
