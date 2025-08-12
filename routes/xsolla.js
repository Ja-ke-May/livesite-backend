const express = require('express');
const router = express.Router();
const axios = require('axios');
const Ajv = require('ajv');

const ajv = new Ajv({ allErrors: true });

const PROJECT_ID = Number(process.env.XSOLLA_PROJECT_ID);
const MERCHANT_ID = process.env.XSOLLA_MERCHANT_ID;
const OAUTH_ACCESS_TOKEN = process.env.XSOLLA_API_KEY;

const skuMap = {
  tokens_400: { amount: 0.99, tokens: 400 },
  tokens_1000: { amount: 19.99, tokens: 1000 },
  tokens_2000: { amount: 29.99, tokens: 2000 },
  tokens_4000: { amount: 49.99, tokens: 4000 },
  tokens_10000: { amount: 99.99, tokens: 10000 },
};

const payloadSchema = {
  type: 'object',
  properties: {
    user: {
      type: 'object',
      properties: {
        id: { type: 'string', pattern: '^[a-zA-Z0-9_\\-]+$' }
      },
      required: ['id'],
      additionalProperties: false
    },
    purchase: {
      type: 'object',
      properties: {
        virtual_items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sku: { type: 'string' },
              quantity: { type: 'integer', minimum: 1 },
              name: { type: 'string' },
              description: { type: 'string' }
            },
            required: ['sku', 'quantity'],
            additionalProperties: false
          },
          minItems: 1
        }
      },
      required: ['virtual_items'],
      additionalProperties: false
    },
    project_id: { type: 'integer' },
  },
  required: ['user', 'purchase', 'project_id'],
  additionalProperties: false
};

const validatePayload = ajv.compile(payloadSchema);

router.post('/get-token', async (req, res) => {
  const { username, sku } = req.body;

  if (!username || !sku) {
    return res.status(400).json({ error: 'Missing username or sku' });
  }

  if (!skuMap[sku]) {
    return res.status(400).json({ error: 'Invalid sku' });
  }

  if (!/^[a-zA-Z0-9_\-]+$/.test(username)) {
    return res.status(400).json({ error: 'Invalid username format (only letters, numbers, underscore, dash allowed)' });
  }

  const payload = {
    user: {
      id: String(username),
    },
    purchase: {
      virtual_items: [
        {
          sku: sku,
          quantity: 1,
          name: `Tokens Package: ${skuMap[sku].tokens} tokens`,
          description: `Purchase of ${skuMap[sku].tokens} tokens`,
        }
      ],
    },
    project_id: PROJECT_ID,
  };

  const valid = validatePayload(payload);
  if (!valid) {
    return res.status(400).json({ error: 'Payload validation failed', details: validatePayload.errors });
  }

  try {
    const response = await axios.post(
      `https://api.xsolla.com/merchant/v2/projects/${PROJECT_ID}/token`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${OAUTH_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        }
      }
    );

    const { token } = response.data;

    if (!token) {
      return res.status(500).json({ error: 'Failed to get payment token from Xsolla' });
    }

    const paymentUrl = `https://secure.xsolla.com/paystation2/?access_token=${token}`;

    return res.json({ paymentUrl });

  } catch (error) {
    console.error('Xsolla CAPI error:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Failed to create payment token' });
  }
});

module.exports = router;