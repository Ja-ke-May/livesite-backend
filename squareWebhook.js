const Square = require("square");
const User = require("./models/user");
const { sendThankYouEmail } = require("./emails");

const client = new Square.Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: "production",
});

const ordersApi = client.ordersApi;
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

    // Only handle payment events
    if (!event.type?.startsWith("payment.")) {
      return res.status(200).send("Ignored");
    }

    const payment = event.data?.object?.payment;
    if (!payment) return res.status(200).send("Ignored");

    console.log("💳 Payment:", {
      id: payment.id,
      status: payment.status,
      orderId: payment.orderId,
    });

    // Only process COMPLETED payments
    if (payment.status !== "COMPLETED") {
      return res.status(200).send("Ignored");
    }

    // ✅ Retrieve full payment details (to ensure orderId exists)
    const { result: paymentResult } = await paymentsApi.getPayment(payment.id);
    const fullPayment = paymentResult?.payment;
    const orderId = fullPayment?.orderId;

    if (!orderId) {
      console.warn("⚠️ No orderId found even after fetching payment", payment.id);
      return res.status(200).send("Ignored");
    }

    // ✅ Deduplication: check if already processed
    const alreadyProcessed = await User.findOne({ "purchases.orderId": orderId });
    if (alreadyProcessed) {
      console.log(`⏩ Skipping duplicate order: ${orderId}`);
      return res.status(200).send("Duplicate ignored");
    }

    // ✅ Retrieve full order details
    const { result: orderResult } = await ordersApi.retrieveOrder(orderId);
    const order = orderResult?.order;
    if (!order) {
      console.warn("⚠️ Order not found for orderId", orderId);
      return res.status(200).send("Ignored");
    }

    if (!order.lineItems?.length) {
      console.warn("⚠️ No line items found on order", orderId);
      console.dir(order, { depth: null });
      return res.status(200).send("Ignored");
    }

    // ✅ Extract metadata from lineItem.note
    let username, sku;
    try {
      const note = order.lineItems[0].note;
      if (note) {
        const parsed = JSON.parse(note);
        username = parsed.username;
        sku = parsed.sku;
      }
    } catch (err) {
      console.warn("⚠️ Failed to parse lineItem.note as JSON:", err.message);
    }

    if (!username || !sku) {
      console.warn("⚠️ Missing username or SKU", { username, sku });
      console.log("🔍 Full lineItems:", JSON.stringify(order.lineItems, null, 2));
      return res.status(200).send("Ignored");
    }

    const tokens = skuMap[sku];
    if (!tokens) {
      console.warn("⚠️ Invalid SKU:", sku);
      return res.status(200).send("Ignored");
    }

    const lineItem = order.lineItems[0];
    const amountSpent = lineItem.basePriceMoney?.amount
      ? Number(lineItem.basePriceMoney.amount) / 100 // avoid BigInt crash
      : 0;

    const newPurchase = {
      date: new Date(),
      tokens,
      amountSpent,
      currency: lineItem.basePriceMoney?.currency || "GBP",
      description: "Token Purchase",
      orderId: order.id,
      paymentId: payment.id,
    };

    // ✅ Credit user
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

    // ✅ Thank you email
    sendThankYouEmail(user, newPurchase).catch((err) =>
      console.error("❌ Email error:", err)
    );

    console.log(
      `✅ ${username} credited with ${tokens} tokens (Order ID: ${order.id}, Payment ID: ${payment.id})`
    );
    res.status(200).send("Processed");
  } catch (err) {
    console.error("❌ Square webhook error:", err);
    res.status(500).send("Server error");
  }
};

module.exports = handleSquareWebhook;
