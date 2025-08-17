const express = require("express");
const router = express.Router();

const Square = require('square'); 
const client = new Square.Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: 'production', 
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

    console.log("Incoming create-checkout request:", { username, sku });

    if (!username || !sku || !tokenDetails[sku]) {
      console.warn("Missing or invalid username/sku");
      return res.status(400).json({ error: "Missing or invalid username/sku" });
    }

    const { name, price } = tokenDetails[sku];
    const amount = Math.round(price * 100); 

    console.log("Calculated amount (cents):", amount);

    const requestPayload = {
      idempotencyKey: Date.now().toString(),
      quickPay: {
        name,
        priceMoney: {
          amount,
          currency: "GBP",
        },
        locationId: process.env.SQUARE_LOCATION_ID,
      },
      checkoutOptions: { referenceId: username },
      note: JSON.stringify({ username, sku }) 
    };

    console.log("Request payload to Square:", requestPayload);

    const { result, errors } = await client.checkoutApi.createPaymentLink(requestPayload);

    if (errors) {
      console.error("Square API returned errors:", errors);
      return res.status(500).json({ error: "Square API error", details: errors });
    }

    console.log("Square API result:", result);

    const checkoutUrl = result?.paymentLink?.url || result?.payment_link?.url;
    if (!checkoutUrl) {
      console.error("No checkout URL received from Square");
      return res.status(500).json({ error: "No checkout URL received" });
    }

    res.json({ checkoutUrl });

  } catch (error) {
    console.error("Unexpected Square error:", error);
    if (error.response) {
      console.error("Square response body:", error.response.body);
    }
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

module.exports = router;
