const express = require('express');
const axios = require('axios');
const router = express.Router();

const API_KEY = process.env.XSOLLA_API_KEY;
const PROJECT_ID = process.env.XSOLLA_PROJECT_ID;

router.post('/get-token', async (req, res) => {
  const { username, sku } = req.body;

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

  console.log('==================');
  console.log('[Xsolla CAPI] Attempting token generation with:');
  console.log('PROJECT_ID:', PROJECT_ID);
  console.log('Username:', username);
  console.log('SKU:', sku);
  console.log('Payload:\n', JSON.stringify(payload, null, 2));
  console.log('==================');

  try {
    const response = await axios.post(
      `https://api.xsolla.com/api/v2/project/${PROJECT_ID}/payment/token`,
      payload,
      {
        auth: {
          username: API_KEY,
          password: ''
        }
      }
    );

    console.log('[Xsolla CAPI] Token generated successfully:');
    console.log('Response:', response.data);

    const token = response.data.token;
    const paymentUrl = `https://secure.xsolla.com/paystation4/?access_token=${token}`;
    res.json({ paymentUrl });

  } catch (err) {
    console.error('[Xsolla CAPI] Error getting token:');
    if (err.response?.data) {
      console.error('Error data:', JSON.stringify(err.response.data, null, 2));
    } else {
      console.error('Error message:', err.message);
    }
    res.status(500).json({ error: 'Failed to get Xsolla token' });
  }
});

module.exports = router;
