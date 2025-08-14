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
  const { username, sku, email } = req.body;
  console.log('================== XSOLLA DEBUG START ==================');
  console.log('[DEBUG] Incoming request body:', req.body);

  if (!username || !sku || !email) { // check email
    console.log('[ERROR] Missing username, sku, or email');
    console.log('=================== XSOLLA DEBUG END ===================');
    return res.status(400).json({ error: 'Missing username, sku, or email' });
  }

  // Mask sensitive data
  const projectId = process.env.XSOLLA_PROJECT_ID?.trim();
  const merchantId = process.env.XSOLLA_MERCHANT_ID?.trim();
  const apiKey = process.env.XSOLLA_API_KEY?.trim();

  console.log('[DEBUG] Env Variables:');
  console.log('  PROJECT_ID:', projectId ? `****${projectId.slice(-4)}` : 'NOT SET');
  console.log('  MERCHANT_ID:', merchantId ? `****${merchantId.slice(-4)}` : 'NOT SET');
  console.log('  API_KEY:', apiKey ? `****${apiKey.slice(-4)}` : 'NOT SET');

  const TOKEN_URL = `https://api.xsolla.com/merchant/v2/projects/${projectId}/token`;
  console.log('[DEBUG] Token Request URL:', TOKEN_URL);

  const payload = {
    user: {
      id: { value: username },
      email: "info@myme.live" 
    },
    purchase: {
      virtual_items: {
        items: [
          {
            sku,
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

  console.log('[DEBUG] Sending payload to Xsolla:', JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(TOKEN_URL, payload, {
      auth: {
        username: merchantId,
        password: apiKey
      },
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('[DEBUG] Xsolla API response status:', response.status);
    console.log('[DEBUG] Xsolla API response headers:', response.headers);
    console.log('[DEBUG] Xsolla API response body:', JSON.stringify(response.data, null, 2));

    const { token } = response.data;
    if (!token) throw new Error('No payment token received');

    console.log('=================== XSOLLA DEBUG END ===================');
    return res.json({
      paymentUrl: `https://secure.xsolla.com/paystation4/?token=${token}`,
      sku,
      tokens: tokenCounts[sku] || null
    });

  } catch (error) {
    console.error('[ERROR] CAPI API error details:');
    if (error.response) {
      console.error('  Status:', error.response.status);
      console.error('  Headers:', error.response.headers);
      console.error('  Body:', error.response.data);
    } else {
      console.error('  Message:', error.message);
    }
    console.log('=================== XSOLLA DEBUG END ===================');

    res.status(error.response?.status || 500).json({
      error: 'Failed to create payment token',
      details: error.response?.data || error.message
    });
  }
});

module.exports = router;
