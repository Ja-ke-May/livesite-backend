const express = require('express');
const axios = require('axios');
const router = express.Router();

const API_KEY = process.env.XSOLLA_API_KEY;         
const PROJECT_ID = process.env.XSOLLA_PROJECT_ID; 

router.post('/get-token', async (req, res) => {
  const { username, sku, sandbox } = req.body; // sandbox param true/false

  if (!username || !sku) {
    return res.status(400).json({ error: 'Missing username or SKU' });
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

  // Add sandbox flag if requested
  if (sandbox === true) {
    payload.settings.sandbox = true;
  }

  // Debug log
  console.log('==================');
  console.log('[Xsolla] Attempting token generation with:');
  console.log('PROJECT_ID:', PROJECT_ID);
  console.log('Username:', username);
  console.log('SKU:', sku);
  console.log('Sandbox mode:', sandbox === true);
  console.log('Payload:\n', JSON.stringify(payload, null, 2));
  console.log('==================');

  try {
    const response = await axios.post(
      `https://api.xsolla.com/merchant/v2/projects/${PROJECT_ID}/token`,
      payload,
      {
        auth: {
          username: PROJECT_ID.toString(),
          password: API_KEY
        }
      }
    );

    console.log('[Xsolla] Token generated successfully:');
    console.log('Response:', response.data);

    const token = response.data.token;
    const paymentUrlBase = sandbox === true
      ? 'https://sandbox-secure.xsolla.com/paystation4'
      : 'https://secure.xsolla.com/paystation4';

    const paymentUrl = `${paymentUrlBase}/?access_token=${token}`;
    res.json({ paymentUrl });

  } catch (err) {
    console.error('[Xsolla] Error getting token:');

    if (err.response?.data) {
      console.error('Error data:', JSON.stringify(err.response.data, null, 2));
    } else {
      console.error('Error message:', err.message);
    }

    res.status(500).json({ error: 'Failed to get Xsolla token' });
  }
});

module.exports = router;
