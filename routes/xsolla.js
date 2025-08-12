const express = require('express');
const axios = require('axios');
const router = express.Router();

const API_KEY = process.env.XSOLLA_API_KEY;            // Xsolla API key (password)
const MERCHANT_ID = process.env.XSOLLA_MERCHANT_ID;    // Xsolla Merchant ID (username)
const PROJECT_ID = process.env.XSOLLA_PROJECT_ID;      // Xsolla Project ID

router.post('/get-token', async (req, res) => {
  const { username, sku, sandbox } = req.body;

  if (!username || !sku) {
    return res.status(400).json({ error: 'Missing username or SKU' });
  }

  // Payload must use "purchase.items" for admin token flow
  const payload = {
    user: {
      id: { value: username }
    },
    purchase: {
      items: [
        { sku, quantity: 1 }
      ]
    },
    settings: {
      language: 'en',
      return_url: 'https://myme.live/shop'
    }
  };

  // Optional: allow sandbox mode toggle
  if (sandbox === true) {
    payload.sandbox = true;
  }

  console.log('==================');
  console.log('[Xsolla CAPI] Attempting admin token generation with:');
  console.log('PROJECT_ID:', PROJECT_ID);
  console.log('MERCHANT_ID:', MERCHANT_ID);
  console.log('Username:', username);
  console.log('SKU:', sku);
  console.log('Payload:\n', JSON.stringify(payload, null, 2));
  console.log('==================');

  try {
    const response = await axios.post(
      `https://api.xsolla.com/api/v2/project/${PROJECT_ID}/admin/payment/token`,
      payload,
      {
        auth: {
          username: MERCHANT_ID.toString(),
          password: API_KEY
        },
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('[Xsolla CAPI] Token generated successfully:');
    console.log('Response:', response.data);

    const token = response.data.token;
    const paymentUrl = `https://secure.xsolla.com/paystation4/?token=${token}`;
    res.json({ paymentUrl, raw: response.data });

  } catch (err) {
    console.error('[Xsolla CAPI] Error getting token:');
    if (err.response?.data) {
      console.error('Error data:', JSON.stringify(err.response.data, null, 2));
    } else {
      console.error('Error message:', err.message);
    }
    res.status(500).json({
      error: 'Failed to get Xsolla token',
      details: err.response?.data || err.message
    });
  }
});

module.exports = router;
