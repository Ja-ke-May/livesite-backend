const express = require('express');
const axios = require('axios');
const router = express.Router();

const API_KEY = process.env.XSOLLA_API_KEY;           
const MERCHANT_ID = process.env.XSOLLA_MERCHANT_ID;    
const PROJECT_ID = process.env.XSOLLA_PROJECT_ID;      

router.post('/get-token', async (req, res) => {
  const { username, sku, sandbox } = req.body;

  if (!username || !sku) {
    return res.status(400).json({ error: 'Missing username or SKU' });
  }

  const payload = {
    user: {
      id: { value: username }
    },
    purchase: {
      items: [{ sku, quantity: 1 }]
    },
    settings: {
      language: 'en',
      return_url: 'https://myme.live/shop'
    }
  };

  if (sandbox === true) {
    payload.sandbox = true;
  }

  console.log('\n==================');
  console.log('[Xsolla CAPI] Attempting token generation tests...');
  console.log('PROJECT_ID:', PROJECT_ID);
  console.log('MERCHANT_ID:', MERCHANT_ID);
  console.log('Username:', username);
  console.log('SKU:', sku);
  console.log('Payload:', JSON.stringify(payload, null, 2));
  console.log('==================\n');

  const endpoints = [
    {
      name: 'User CAPI Token',
      url: `https://api.xsolla.com/api/v2/project/${PROJECT_ID}/payment/token`,
      auth: { username: API_KEY, password: '' }
    },
    {
      name: 'Admin CAPI Token',
      url: `https://api.xsolla.com/api/v2/project/${PROJECT_ID}/admin/payment/token`,
      auth: { username: MERCHANT_ID.toString(), password: API_KEY }
    }
  ];

  for (const ep of endpoints) {
    console.log(`\n--- Trying ${ep.name} ---`);
    console.log('POST', ep.url);
    console.log('Auth:', ep.auth);

    try {
      const response = await axios.post(ep.url, payload, {
        auth: ep.auth,
        headers: { 'Content-Type': 'application/json' }
      });

      console.log(`[${ep.name}] ✅ Success`);
      console.log('Raw Response:', JSON.stringify(response.data, null, 2));

      const token = response.data.token;
      const paymentUrl = `https://secure.xsolla.com/paystation4/?access_token=${token}`;

      return res.json({
        success: true,
        endpointTried: ep.name,
        paymentUrl,
        rawResponse: response.data
      });

    } catch (err) {
      console.error(`[${ep.name}] ❌ Failed`);
      if (err.response) {
        console.error('Status:', err.response.status);
        console.error('Data:', JSON.stringify(err.response.data, null, 2));
      } else {
        console.error('Error:', err.message);
      }
    }
  }

  return res.status(500).json({
    success: false,
    error: 'Both endpoints failed',
    note: 'Check logs for detailed request/response data'
  });
});

module.exports = router;
