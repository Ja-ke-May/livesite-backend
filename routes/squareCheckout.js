const express = require("express");
const router = express.Router();
const Square = require("square");

const client = new Square.Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: "production",
});

const tokenDetails = {
  tokens_400: { name: "Tokens 400", price: 0.01 },
  tokens_1000: { name: "Tokens 1000", price: 19.99 },
  tokens_2000: { name: "Tokens 2000", price: 29.99 },
  tokens_4000: { name: "Tokens 4000", price: 49.99 },
  tokens_10000: { name: "Tokens 10000", price: 99.99 },
};

router.post("/create-checkout", async (req, res) => {
  try {
    const { username, sku } = req.body;

    if (!username || !sku || !tokenDetails[sku]) {
      return res.status(400).json({ error: "Missing or invalid username/sku" });
    }

    const { name, price } = tokenDetails[sku];
    const amount = Math.round(Number(price) * 100);

    const idempotencyKey = `${username}-${sku}-${Date.now()}`;

    // Include username and SKU directly in the line item note
    const lineItemNote = JSON.stringify({ username, sku });

    const requestPayload = {
      idempotencyKey,
      order: {
        locationId: process.env.SQUARE_LOCATION_ID,
        lineItems: [
          {
            name,                 // e.g., "Tokens 1000"
            quantity: "1",
            basePriceMoney: { amount, currency: "GBP" },
            note: lineItemNote,   // username & sku stored here
          },
        ],
      },
      checkoutOptions: {
        redirectUrl: process.env.CLIENT_SUCCESS_URL,
      },
    };

    const { result, errors } = await client.checkoutApi.createPaymentLink(requestPayload);

    if (errors) {
      console.error("❌ Square API error:", errors);
      return res.status(500).json({ error: "Square API error", details: errors });
    }

    const checkoutUrl = result.paymentLink?.url;

    console.log(`✅ Created checkout link for ${username} (${sku}): ${checkoutUrl}`);
    res.json({ checkoutUrl });
  } catch (error) {
    console.error("❌ Square checkout error:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
