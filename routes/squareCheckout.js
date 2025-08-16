const express = require("express");
const router = express.Router();


let Client;

(async () => {
  const square = await import("square");
  Client = square.Client;
})();

router.post("/create-checkout", async (req, res) => {
  try {
    if (!Client) {
      return res.status(500).json({ error: "Square SDK not initialized yet" });
    }

    const client = new Client({
      accessToken: process.env.SQUARE_ACCESS_TOKEN,
      environment: "production", // or "sandbox"
    });

    const { result } = await client.checkoutApi.createPaymentLink({
      idempotencyKey: new Date().getTime().toString(),
      quickPay: {
        name: "Test Item",
        priceMoney: {
          amount: 100,
          currency: "USD",
        },
        locationId: process.env.SQUARE_LOCATION_ID,
      },
    });

    res.json({ url: result.paymentLink.url });
  } catch (error) {
    console.error("Square error:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
