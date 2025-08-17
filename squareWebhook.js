const { Client } = require("square");
const User = require("./models/user");
const { sendThankYouEmail } = require("./emails");

// Token mapping
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

// Square client
const squareClient = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: process.env.SQUARE_ENVIRONMENT || "production",
});

// Extract details directly from payment + lineItem.note
const extractPaymentDetails = async (payment, ordersApi) => {
  let sku = null;
  let username = null;
  let purchaseId = null;

  console.log("🔍 Extracting payment details:", payment.id);

  // 1️⃣ Try payment.note (should contain JSON)
  if (payment.note) {
    try {
      const noteData = JSON.parse(payment.note);
      username = noteData.username || username;
      sku = noteData.sku || sku;
      purchaseId = noteData.purchaseId || purchaseId;
      console.log("✅ Extracted from payment.note:", noteData);
    } catch {
      console.warn("⚠️ Failed to parse payment.note:", payment.note);
    }
  }

  // 2️⃣ ReferenceId fallback
  if ((!username || !sku || !purchaseId) && payment.referenceId) {
    const parts = payment.referenceId.split("-");
    if (!username && parts[0]) username = parts[0];
    if (!sku && parts[1]) sku = parts[1];
    if (!purchaseId && parts.slice(2).length) purchaseId = parts.slice(2).join("-");
    console.log("✅ Extracted from referenceId:", { username, sku, purchaseId });
  }

  // 3️⃣ Fetch order + lineItem.note if still missing
  if ((!username || !sku || !purchaseId) && payment.orderId) {
    try {
      const { result } = await ordersApi.retrieveOrder(payment.orderId);
      const lineItem = result?.order?.lineItems?.[0];

      if (lineItem?.note) {
        try {
          const noteData = JSON.parse(lineItem.note);
          username = noteData.username || username;
          sku = noteData.sku || sku;
          purchaseId = noteData.purchaseId || purchaseId;
          console.log("✅ Extracted from lineItem.note:", noteData);
        } catch {
          console.warn("⚠️ Failed to parse lineItem.note:", lineItem.note);
        }
      }
    } catch (err) {
      console.error("❌ Error fetching order:", err);
    }
  }

  console.log("🏷 Final extracted details:", { sku, username, purchaseId });
  return { sku, username, purchaseId };
};

// Webhook handler
const handleSquareWebhook = async (req, res) => {
  try {
    const event = req.body;
    console.log("📬 Incoming Square webhook:", event.type, event.event_id);

    if (!event.type?.startsWith("payment.")) return res.status(200).send("Ignored");

    const payment = event.data?.object?.payment;
    if (!payment) return res.status(200).send("Ignored");
    if (payment.status !== "COMPLETED") return res.status(200).send("Ignored");

    const { sku, username, purchaseId } = await extractPaymentDetails(payment, squareClient.ordersApi);

    if (!username) {
      console.warn("⚠️ Payment ignored: username missing");
      return res.status(200).send("Ignored");
    }

    if (!sku || !skuMap[sku]) {
      console.warn("⚠️ Payment ignored: invalid or missing SKU:", sku);
      return res.status(200).send("Ignored");
    }

    const tokens = skuMap[sku];
    const amountSpent = payment.amountMoney?.amount ? payment.amountMoney.amount / 100 : 0;

    // Prevent double-credit (check both paymentId + purchaseId)
    const existingUser = await User.findOne({
      $or: [
        { "purchases.paymentId": payment.id },
        purchaseId ? { "purchases.purchaseId": purchaseId } : {},
      ],
    });
    if (existingUser) {
      console.warn(`⚠️ Payment ${payment.id} / purchase ${purchaseId} already processed for ${username}`);
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

    // ✅ Update user tokens and record purchase
    const user = await User.findOneAndUpdate(
      { userName: username },
      { $inc: { tokens }, $push: { purchases: newPurchase } },
      { new: true }
    );

    if (!user) {
      console.warn(`⚠️ Unknown user: ${username}`);
      return res.status(200).send("Ignored");
    }

    sendThankYouEmail(user, newPurchase).catch(err =>
      console.error("❌ Email error:", err)
    );

    console.log(`✅ ${username} credited with ${tokens} tokens (Payment ID: ${payment.id}, Purchase ID: ${purchaseId})`);
    res.status(200).send("Processed");
  } catch (err) {
    console.error("❌ Square webhook error:", err);
    res.status(500).send("Server error");
  }
};

module.exports = handleSquareWebhook;
