const Square = require("square");
const User = require("./models/user");
const { sendThankYouEmail } = require("./emails");

const client = new Square.Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: "production",
});
const paymentsApi = client.paymentsApi;

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

    if (!event.type?.startsWith("payment.")) return res.status(200).send("Ignored");

    const payment = event.data?.object?.payment;
    if (!payment) return res.status(200).send("Ignored");
    if (payment.status !== "COMPLETED") return res.status(200).send("Ignored");

    // Extract username and SKU from metadata
    const username = payment.metadata?.username;
    const sku = payment.metadata?.sku;
    if (!username || !sku) {
      console.warn("⚠️ Missing username or SKU in metadata");
      return res.status(200).send("Ignored");
    }

    const tokens = skuMap[sku];
    if (!tokens) {
      console.warn("⚠️ Invalid SKU:", sku);
      return res.status(200).send("Ignored");
    }

    const amountSpent = payment.amountMoney?.amount
      ? payment.amountMoney.amount / 100
      : 0;

    const newPurchase = {
      date: new Date(),
      tokens,
      amountSpent,
      currency: payment.amountMoney?.currency || "GBP",
      description: "Token Purchase",
      paymentId: payment.id,
    };

    // Update user by username
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

    sendThankYouEmail(user, newPurchase).catch(err =>
      console.error("❌ Email error:", err)
    );

    console.log(`✅ ${username} credited with ${tokens} tokens (Payment ID: ${payment.id})`);
    res.status(200).send("Processed");
  } catch (err) {
    console.error("❌ Square webhook error:", err);
    res.status(500).send("Server error");
  }
};

module.exports = handleSquareWebhook;
