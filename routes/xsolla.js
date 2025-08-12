const express = require('express');
const axios = require('axios');
const router = express.Router();

const API_KEY = process.env.XSOLLA_API_KEY;         
const PROJECT_ID = process.env.XSOLLA_PROJECT_ID; 

router.post('/get-token', async (req, res) => {
  const { username, sku, sandbox } = req.body; 

  console.log('==== New /get-token Request ====');
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  console.log('Environment Variables:');
  console.log('  XSOLLA_PROJECT_ID:', PROJECT_ID);
  console.log('  XSOLLA_API_KEY:', API_KEY ? '***redacted***' : 'MISSING');

  if (!username || !sku) {
    console.error('[Xsolla] Missing username or SKU in request');
    return res.status(400).json({ error: 'Missing username or SKU' });
  }

  if (!PROJECT_ID || !API_KEY) {
    console.error('[Xsolla] Missing required environment variables');
    return res.status(500).json({ error: 'Server configuration error: missing API key or project ID' });
  }

  const payload = {
    user: {
      id: { value: username }
    },
    purchase: {
      virtual_items: {
        items: [{ sku, amount: 1 }]
      }
    },
    settings: {
      language: 'en',
      return_url: 'https://myme.live/shop'
    }
  };

  if (sandbox === true) {
    payload.settings.sandbox = true;
  }

  console.log('==================');
  console.log('[Xsolla] Attempting token generation with:');
  console.log('PROJECT_ID:', PROJECT_ID);
  console.log('Username:', username);
  console.log('SKU:', sku);
  console.log('Sandbox mode:', sandbox === true);
  console.log('Payload:\n', JSON.stringify(payload, null, 2));
  console.log('==================');

  try {
    const url = `https://api.xsolla.com/api/v2/project/${PROJECT_ID}/payment/token`;
    console.log('[Xsolla] Request URL:', url);

    const auth = {
      username: API_KEY,
      password: ''
    };
    console.log('[Xsolla] Auth used:', { username: '***redacted***', password: '***redacted***' });

    const response = await axios.post(url, payload, { auth });

    console.log('[Xsolla] Token generated successfully:');
    console.log('Response data:', JSON.stringify(response.data, null, 2));

    const token = response.data.token;
    const paymentUrlBase = sandbox === true
      ? 'https://sandbox-secure.xsolla.com/paystation4'
      : 'https://secure.xsolla.com/paystation4';

    const paymentUrl = `${paymentUrlBase}/?access_token=${token}`;
    console.log('[Xsolla] Generated payment URL:', paymentUrl);

    res.json({ paymentUrl });

  } catch (err) {
    console.error('[Xsolla] Error getting token:');
    if (err.response?.data) {
      console.error('Error HTTP status:', err.response.status);
      console.error('Error response data:', JSON.stringify(err.response.data, null, 2));
    } else {
      console.error('Error message:', err.message);
    }

    res.status(500).json({ error: 'Failed to get Xsolla token' });
  }
});

module.exports = router;
