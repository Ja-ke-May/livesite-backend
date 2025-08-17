const { Client } = require("square");
const User = require("./models/user");
const { sendThankYouEmail } = require("./emails");

const skuMap = {
  tokens_400: 400,
  tokens_1000: 1000,
  tokens_2000: 2000,
  tokens_4000: 4000,
  tokens_10000: 10000,
  tokens_50000: 50000,
  tokens_150000: 150000,
  tokens_400000: 400000,
  tokens_1000000: 1000000,
};

const squareClient = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: process.env.SQUARE_ENVIRONMENT || "production",
});

/**
 * Extract { username, sku, purchaseId } from order.referenceId
 */
const extractPaymentDetails = async (payment, ordersApi) => {
  let sku = null;
  let username = null;
  let purchaseId = null;

  console.log("🔍 Extracting payment details:", payment.id);

  if (payment.orderId) {
    try {
      const { result } = await ordersApi.retrieveOrder(payment.orderId);
      const orderRef = result?.order?.referenceId;

      if (orderRef) {
        const parts = orderRef.split("-");
        username = parts[0] || null;
        sku = parts[1] || null;
        purchaseId = parts.slice(2).join("-") || null;

        console.log("✅ Extracted from order.referenceId:", {
          username,
          sku,
          purchaseId,
        });
      } else {
        console.warn("⚠️ No referenceId found on order:", payment.orderId);
      }
    } catch (err) {
      console.error("❌ Error fetching order:", err);
    }
  } else {
    console.warn("⚠️ Payment missing orderId:", payment.id);
  }

  console.log("🏷 Final extracted details:", { sku, username, purchaseId });
  return { sku, username, purchaseId };
};

/**
 * Main Square Webhook handler
 */
const handleSquareWebhook = async (req, res) => {
  try {
    const event = req.body;
    console.log("📬 Incoming Square webhook:", event.type, event.event_id);

    // Only care about payment events
    if (!event.type?.startsWith("payment.")) {
      return res.status(200).send("Ignored");
    }

    const payment = event.data?.object?.payment;
    if (!payment) {
      console.warn("⚠️ Webhook missing payment object");
      return res.status(200).send("Ignored");
    }

    if (payment.status !== "COMPLETED") {
      console.log(`ℹ️ Payment ${payment.id} status = ${payment.status}, ignored`);
      return res.status(200).send("Ignored");
    }

    // Extract username / sku / purchaseId from order.referenceId
    const { sku, username, purchaseId } = await extractPaymentDetails(
      payment,
      squareClient.ordersApi
    );

    if (!username) {
      console.warn("⚠️ Payment ignored: username missing");
      return res.status(200).send("Ignored");
    }

    if (!sku || !skuMap[sku]) {
      console.warn("⚠️ Payment ignored: invalid or missing SKU:", sku);
      return res.status(200).send("Ignored");
    }

    const tokens = skuMap[sku];
    const amountSpent =
      payment.amountMoney?.amount != null
        ? payment.amountMoney.amount / 100
        : 0;

    // Prevent double-crediting
    const existingUser = await User.findOne({
      $or: [
        { "purchases.paymentId": payment.id },
        purchaseId ? { "purchases.purchaseId": purchaseId } : {},
      ],
    });

    if (existingUser) {
      console.warn(
        `⚠️ Payment ${payment.id} / purchase ${purchaseId} already processed for ${username}`
      );
      return res.status(200).send("Already processed");
    }

    const newPurchase = {
      date: new Date(),
      tokens,
      amountSpent,
      currency: payment.amountMoney?.currency || "GBP",
      description: "Token Purchase",
      paymentId: payment.id,
      purchaseId,
    };

    const user = await User.findOneAndUpdate(
      { userName: username },
      { $inc: { tokens }, $push: { purchases: newPurchase } },
      { new: true }
    );

    if (!user) {
      console.warn(`⚠️ Unknown user: ${username}`);
      return res.status(200).send("Ignored");
    }

    // Fire-and-forget thank-you email
    sendThankYouEmail(user, newPurchase).catch((err) =>
      console.error("❌ Email error:", err)
    );

    console.log(
      `✅ ${username} credited with ${tokens} tokens (Payment ID: ${payment.id}, Purchase ID: ${purchaseId})`
    );
    res.status(200).send("Processed");
  } catch (err) {
    console.error("❌ Square webhook error:", err);
    res.status(500).send("Server error");
  }
};

module.exports = handleSquareWebhook;
