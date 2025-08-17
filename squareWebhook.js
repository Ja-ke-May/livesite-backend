const Square = require("square");
const User = require("./models/user");
const { sendThankYouEmail } = require("./emails");

const client = new Square.Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: "production",
});

const skuMap = {
  tokens_400: 400,
  tokens_1000: 1000,
  tokens_2000: 2000,
  tokens_4000: 4000,
  tokens_10000: 10000,
};

const handleSquareWebhook = async (req, res) => {
  try {
    const event = req.body;
    console.log("📬 Incoming Square webhook:", event.type, event.event_id);

    // ✅ Just log payments
    if (event.type?.startsWith("payment.")) {
      const payment = event.data?.object?.payment;
      if (payment) {
        console.log("💳 Payment:", {
          id: payment.id,
          status: payment.status,
          orderId: payment.orderId,
        });
      }
      return res.status(200).send("Logged payment");
    }

    // ✅ Process orders (where username + sku live)
    if (event.type?.startsWith("order.")) {
      const order = event.data?.object?.order;
      if (!order?.lineItems?.length) {
        console.warn("⚠️ No line items found on order");
        return res.status(200).send("Ignored");
      }

      let username, sku;
      try {
        const note = order.lineItems[0].note;
        if (note) {
          const parsed = JSON.parse(note);
          username = parsed.username;
          sku = parsed.sku;
        }
      } catch (err) {
        console.warn("⚠️ Failed to parse lineItem.note as JSON");
      }

      if (!username || !sku) {
        console.warn("⚠️ Missing username or SKU", { username, sku });
        return res.status(200).send("Ignored");
      }

      const tokens = skuMap[sku];
      if (!tokens) {
        console.warn("⚠️ Invalid SKU:", sku);
        return res.status(200).send("Ignored");
      }

      // Amount may not be on order, so we grab from first lineItem if needed
      const lineItem = order.lineItems[0];
      const amountSpent = lineItem.basePriceMoney?.amount
        ? lineItem.basePriceMoney.amount / 100
        : 0;

      const newPurchase = {
        date: new Date(),
        tokens,
        amountSpent,
        currency: lineItem.basePriceMoney?.currency || "GBP",
        description: "Token Purchase",
        orderId: order.id,
      };

      const user = await User.findOneAndUpdate(
        { username },
        {
          $inc: { tokens },
          $set: { lastPurchaseAmount: amountSpent },
          $push: { purchases: newPurchase },
        },
        { new: true }
      );

      if (!user) {
        console.warn(`⚠️ Unknown user: ${username}`);
        return res.status(200).send("Ignored");
      }

      sendThankYouEmail(user, newPurchase).catch((err) =>
        console.error("❌ Email error:", err)
      );

      console.log(
        `✅ ${username} credited with ${tokens} tokens (Order ID: ${order.id})`
      );
      return res.status(200).send("Processed");
    }

    // Ignore other event types
    res.status(200).send("Ignored");
  } catch (err) {
    console.error("❌ Square webhook error:", err);
    res.status(500).send("Server error");
  }
};

module.exports = handleSquareWebhook;
