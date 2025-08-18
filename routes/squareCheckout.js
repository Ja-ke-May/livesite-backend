const express = require("express");
const router = express.Router();
const Square = require("square");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");

const client = new Square.Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: process.env.SQUARE_ENVIRONMENT || "production",
});

const tokenDetails = {
  tokens_400: { name: "Tokens 400", price: 9.99 },
  tokens_1000: { name: "Tokens 1000", price: 19.99 },
  tokens_2000: { name: "Tokens 2000", price: 29.99 },
  tokens_4000: { name: "Tokens 4000", price: 49.99 },
  tokens_10000: { name: "Tokens 10000", price: 99.99 },
  tokens_50000: { name: "Tokens 50000", price: 249.99 },
  tokens_150000: { name: "Tokens 150000", price: 499.99 },
  tokens_400000: { name: "Tokens 400000", price: 999.99 }, 
  tokens_1000000: { name: "Tokens 1000000", price: 1999.99 },
};

router.post("/create-checkout", async (req, res) => {
  try {
    const { username, sku } = req.body;

    if (!username || !sku || !tokenDetails[sku]) {
      return res.status(400).json({ error: "Missing or invalid username/sku" });
    }

    const { name, price } = tokenDetails[sku];
    const amount = Math.round(Number(price) * 100);

    // Full unique purchase ID (for DB/logging)
    const purchaseId = `${username}-${sku}-${uuidv4()}`;

    // Square requires referenceId <= 40 chars → use short random ID
    const shortId = crypto.randomBytes(4).toString("hex"); // 8 chars
    const referenceId = `${username}-${sku}-${shortId}`.slice(0, 40);

    const requestPayload = {
      idempotencyKey: purchaseId, // ✅ ensures no duplicate link creation
      order: {
        locationId: process.env.SQUARE_LOCATION_ID,
        referenceId, // ✅ this is what webhook will use
        lineItems: [
          {
            name,
            quantity: "1",
            basePriceMoney: { amount, currency: "GBP" },
          },
        ],
      },
      checkoutOptions: {
        redirectUrl: `${process.env.CLIENT_SUCCESS_URL}?username=${encodeURIComponent(
          username
        )}&sku=${sku}&purchaseId=${purchaseId}`,
      },
    };

    const { result, errors } = await client.checkoutApi.createPaymentLink(requestPayload);

    if (errors) {
      console.error("❌ Square API error:", errors);
      return res.status(500).json({ error: "Square API error", details: errors });
    }

    const checkoutUrl = result.paymentLink?.url;
    console.log(`✅ Created checkout link for ${username} (${sku}) [${purchaseId}] → ${checkoutUrl}`);
    console.log(`   ↳ referenceId stored in Square order: ${referenceId}`);

    res.json({ checkoutUrl, purchaseId, referenceId });
  } catch (error) {
    console.error("❌ Square checkout error:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
