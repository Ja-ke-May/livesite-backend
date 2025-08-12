const express = require('express');
const router = express.Router();
const axios = require('axios');
const Ajv = require('ajv');

const ajv = new Ajv({ allErrors: true });

const PROJECT_ID = Number(process.env.XSOLLA_PROJECT_ID);
const MERCHANT_ID = process.env.XSOLLA_MERCHANT_ID;
const OAUTH_ACCESS_TOKEN = process.env.XSOLLA_API_KEY;

const skuMap = {
  tokens_400: { item_id: 1055102, amount: 0.99, tokens: 400 },
  tokens_1000: { item_id: 1055103, amount: 19.99, tokens: 1000 },
  tokens_2000: { item_id: 1055104, amount: 29.99, tokens: 2000 },
  tokens_4000: { item_id: 1055105, amount: 49.99, tokens: 4000 },
  tokens_10000: { item_id: 1055106, amount: 99.99, tokens: 10000 },
};

const payloadSchema = {
  type: 'object',
  properties: {
    user: {
      type: 'object',
      properties: {
        id: {
          type: 'object',
          properties: {
            value: { type: 'string', pattern: '^[a-zA-Z0-9_\\-]+$' }
          },
          required: ['value'],
          additionalProperties: false
        }
      },
      required: ['id'],
      additionalProperties: false
    },
    purchase: {
      type: 'object',
      properties: {
        virtual_items: {
          type: 'object',
          minProperties: 1,
          patternProperties: {
            '^[0-9]+$': { type: 'integer', minimum: 1 }
          },
          additionalProperties: false
        }
      },
      required: ['virtual_items'],
      additionalProperties: false
    }
  },
  required: ['user', 'purchase'],
  additionalProperties: false
};

const validatePayload = ajv.compile(payloadSchema);

router.post('/get-token', async (req, res) => {
  const { username, sku } = req.body;

  console.log('[DEBUG] Incoming request:', req.body);

  if (!username || !sku) {
    console.warn('[WARN] Missing username or SKU');
    return res.status(400).json({ error: 'Missing username or sku' });
  }

  if (!skuMap[sku]) {
    console.warn('[WARN] Invalid SKU:', sku);
    return res.status(400).json({ error: 'Invalid sku' });
  }

  if (!/^[a-zA-Z0-9_\-]+$/.test(username)) {
    console.warn('[WARN] Invalid username format:', username);
    return res.status(400).json({
      error: 'Invalid username format (only letters, numbers, underscore, dash allowed)'
    });
  }

  const xsollaItemId = skuMap[sku].item_id;

  const payload = {
    user: {
      id: { value: String(username) }
    },
    purchase: {
      virtual_items: {
        [xsollaItemId.toString()]: 1
      }
    }
  };

  console.log('[DEBUG] Payload being sent to Xsolla:', JSON.stringify(payload, null, 2));

  const valid = validatePayload(payload);
  if (!valid) {
    console.error('[ERROR] Payload validation failed:', validatePayload.errors);
    return res.status(400).json({ error: 'Payload validation failed', details: validatePayload.errors });
  }

  try {
    const response = await axios.post(
      `https://api.xsolla.com/merchant/v2/projects/${PROJECT_ID}/token`,
      payload,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${MERCHANT_ID}:${OAUTH_ACCESS_TOKEN}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('[DEBUG] Xsolla API response:', response.data);

    const { token } = response.data;

    if (!token) {
      console.error('[ERROR] No token in Xsolla response');
      return res.status(500).json({ error: 'Failed to get payment token from Xsolla' });
    }

    const paymentUrl = `https://secure.xsolla.com/paystation3/?access_token=${token}`;
    return res.json({ paymentUrl });

  } catch (error) {
    console.error('[ERROR] Xsolla CAPI error:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Failed to create payment token', details: error.response?.data || error.message });
  }
});

module.exports = router;
