// routes/squareCheckout.js
const express = require("express");
const router = express.Router();
const { Client } = require("square"); // ✅ CommonJS import

const client = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: process.env.NODE_ENV === "production" ? "production" : "sandbox",
});

// Create checkout link
router.post("/create-checkout", async (req, res) => {
  try {
    const { userName, sku } = req.body;

    if (!userName || !sku) {
      return res.status(400).json({ error: "Missing userName or sku" });
    }

    const { result } = await client.checkoutApi.createPaymentLink({
      idempotencyKey: new Date().getTime().toString(),
      quickPay: {
        name: sku,
        priceMoney: {
          // map SKU → cents
          amount: (() => {
            switch (sku) {
              case "tokens_400": return 400 * 100;
              case "tokens_1000": return 1000 * 100;
              case "tokens_2000": return 2000 * 100;
              case "tokens_4000": return 4000 * 100;
              case "tokens_10000": return 10000 * 100;
              default: return 0;
            }
          })(),
          currency: "USD",
        },
        locationId: process.env.SQUARE_LOCATION_ID,
      },
      checkoutOptions: {
        referenceId: userName,
      },
    });

    res.json({ url: result.paymentLink.url });
  } catch (error) {
    console.error("Square error:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
