const express = require("express"); 
const router = express.Router();

const Square = require('square');  // CommonJS import
const client = new Square.Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: process.env.SQUARE_ENV,
});

router.post("/create-checkout", async (req, res) => {
  try {
    const { userName, sku } = req.body;

    console.log("Incoming create-checkout request:", { userName, sku });

    if (!userName || !sku) {
      console.warn("Missing userName or sku");
      return res.status(400).json({ error: "Missing userName or sku" });
    }

    const amount = (() => {
      switch (sku) {
        case "tokens_400": return 400 * 100;
        case "tokens_1000": return 1000 * 100;
        case "tokens_2000": return 2000 * 100;
        case "tokens_4000": return 4000 * 100;
        case "tokens_10000": return 10000 * 100;
        default: return 0;
      }
    })();

    console.log("Calculated amount (cents):", amount);

    if (amount <= 0) {
      console.warn("Invalid SKU or amount 0");
      return res.status(400).json({ error: "Invalid SKU" });
    }

    const requestPayload = {
      idempotencyKey: new Date().getTime().toString(),
      quickPay: {
        name: sku,
        priceMoney: {
          amount,
          currency: "USD",
        },
        locationId: process.env.SQUARE_LOCATION_ID,
      },
      checkoutOptions: { referenceId: userName },
    };

    console.log("Request payload to Square:", requestPayload);

    const { result, errors } = await client.checkoutApi.createPaymentLink(requestPayload);

    if (errors) {
      console.error("Square API returned errors:", errors);
      return res.status(500).json({ error: "Square API error", details: errors });
    }

    console.log("Square API result:", result);

    res.json({ url: result.paymentLink.url });

  } catch (error) {
    console.error("Unexpected Square error:", error);
    if (error.response) {
      console.error("Square response body:", error.response.body);
    }
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

module.exports = router;
