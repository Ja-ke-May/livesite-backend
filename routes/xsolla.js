const express = require('express');
const axios = require('axios');
const router = express.Router();

const MERCHANT_ID = process.env.XSOLLA_MERCHANT_ID;
const API_KEY = process.env.XSOLLA_API_KEY;

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
      currency: "GBP",
      language: "en",
      external_id: `order_${Date.now()}`,
      return_url: "https://myme.live/shop", 
      project_id: process.env.XSOLLA_PROJECT_ID
    }
  };

  try {
    const response = await axios.post(
      `https://api.xsolla.com/merchant/v2/merchants/${MERCHANT_ID}/token`,
      payload,
      {
        auth: {
          username: MERCHANT_ID,
          password: API_KEY
        }
      }
    );

    console.log('Xsolla response:', response.data);


    const token = response.data.token;
    const paymentUrl = `https://sandbox-secure.xsolla.com/paystation3/?access_token=${token}`;
    res.json({ paymentUrl });
  } catch (err) {
    console.error('Xsolla token error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to get Xsolla token' });
  }
});

module.exports = router;
