const express = require('express');
const axios = require('axios');
const router = express.Router();

const API_KEY = process.env.XSOLLA_API_KEY;         
const PROJECT_ID = Number(process.env.XSOLLA_PROJECT_ID); 

router.post('/get-token', async (req, res) => {
  const { username, sku } = req.body;

  if (!username || !sku) {
    return res.status(400).json({ error: 'Missing username or SKU' });
  }

  try {
    // 1️⃣ Check project status first
    const projectStatusResp = await axios.get(
      `https://api.xsolla.com/merchant/v2/projects/${PROJECT_ID}`,
      {
        auth: {
          username: PROJECT_ID.toString(),
          password: API_KEY
        }
      }
    );

    const projectMode = projectStatusResp.data.mode || 'unknown';
    console.log(`[Xsolla] Project mode: ${projectMode}`);

    if (projectMode.toLowerCase() === 'sandbox') {
      console.warn('[Xsolla] WARNING: Project is still in sandbox mode. Live payments will not work.');
    }

    // 2️⃣ Prepare payload for token generation
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
        currency: 'GBP',
        language: 'en',
        return_url: 'https://myme.live/shop'
      }
    };

    console.log('==================');
    console.log('[Xsolla] Attempting token generation with:');
    console.log('PROJECT_ID:', PROJECT_ID);
    console.log('Project mode:', projectMode);
    console.log('Username:', username);
    console.log('SKU:', sku);
    console.log('Payload:\n', JSON.stringify(payload, null, 2));
    console.log('==================');

    // 3️⃣ Request token
    const tokenResp = await axios.post(
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
    console.log('Response:', tokenResp.data);

    const token = tokenResp.data.token;
    const paymentUrl = `https://secure.xsolla.com/paystation4/?access_token=${token}`;

    // Include project mode in the response for visibility
    res.json({ projectMode, paymentUrl });

  } catch (err) {
    console.error('[Xsolla] Error:');

    if (err.response?.data) {
      console.error('Error data:', JSON.stringify(err.response.data, null, 2));
    } else {
      console.error('Error message:', err.message);
    }

    res.status(500).json({ error: 'Failed to get Xsolla token or project status' });
  }
});

module.exports = router;
