const Square = require("square");
const User = require("./models/user");
const { sendThankYouEmail } = require("./emails");

const client = new Square.Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: "production",
});
const ordersApi = client.ordersApi;

const skuMap = {
  tokens_400: 400,
  tokens_1000: 1000,
  tokens_2000: 2000,
  tokens_4000: 4000,
  tokens_10000: 10000,
};

// Helper to fetch SKU and username from Square order
const fetchOrderDetails = async (orderId) => {
  try {
    const { result } = await ordersApi.retrieveOrder(orderId);
    const order = result.order;
    if (!order || !order.lineItems || !order.lineItems.length) return {};

    const lineItem = order.lineItems[0];
    const name = lineItem.name; // expected to contain SKU
    const sku = Object.keys(skuMap).find((key) => name.includes(key));

    // Extract username from note if possible
    let username = null;
    if (lineItem.note) {
      try {
        const noteData = JSON.parse(lineItem.note);
        username = noteData.username;
      } catch {}
    }

    return { sku, username };
  } catch (err) {
    console.error("❌ Error fetching order:", err);
    return {};
  }
};

const handleSquareWebhook = async (req, res) => {
  try {
    const event = req.body;
    console.log("📬 Incoming Square webhook:", event.type, event.event_id);

    if (!event.type?.startsWith("payment.")) return res.status(200).send("Ignored");

    const payment = event.data?.object?.payment;
    if (!payment) return res.status(200).send("Ignored");
    if (payment.status !== "COMPLETED") return res.status(200).send("Ignored");

    if (!payment.orderId) {
      console.warn("⚠️ Payment has no orderId, cannot determine SKU/username");
      return res.status(200).send("Ignored");
    }

    // Fetch SKU and username from order
    const { sku, username } = await fetchOrderDetails(payment.orderId);

    if (!username) {
      console.warn("⚠️ No username found in order:", payment.orderId);
      return res.status(200).send("Ignored");
    }

    if (!sku || !skuMap[sku]) {
      console.warn("⚠️ Invalid or missing SKU:", sku);
      return res.status(200).send("Ignored");
    }

    const tokens = skuMap[sku];
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
