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

// Extract SKU & username from payment
const extractPaymentDetails = async (payment) => {
  let sku = null;
  let username = null;

  // 1️⃣ Metadata on payment
  if (payment.metadata) {
    username = payment.metadata.username || username;
    sku = payment.metadata.sku || sku;
  }

  // 2️⃣ Note fallback
  if ((!username || !sku) && payment.note) {
    try {
      const noteData = JSON.parse(payment.note);
      username = username || noteData.username;
      sku = sku || noteData.sku;
    } catch {}
  }

  // 3️⃣ Reference ID fallback
  if ((!username || !sku) && payment.referenceId) {
    const refParts = payment.referenceId.split("-");
    if (!username && refParts.length > 0) username = refParts[0];
    if (!sku && refParts.length > 1) sku = refParts[1];
  }

  // 4️⃣ Fetch order if still missing
  if ((!username || !sku) && payment.orderId) {
    try {
      const { result } = await ordersApi.retrieveOrder(payment.orderId);
      const lineItems = result?.order?.lineItems || [];

      for (const lineItem of lineItems) {
        if (lineItem.metadata) {
          username = username || lineItem.metadata.username;
          sku = sku || lineItem.metadata.sku;
        }

        if ((!username || !sku) && lineItem.note) {
          try {
            const noteData = JSON.parse(lineItem.note);
            username = username || noteData.username;
            sku = sku || noteData.sku;
          } catch {}
        }

        if (!sku) {
          sku = Object.keys(skuMap).find((key) => lineItem.name.includes(key));
        }

        if (username && sku) break;
      }
    } catch (err) {
      console.error("❌ Error fetching order:", err);
    }
  }

  return { sku, username };
};

const handleSquareWebhook = async (req, res) => {
  try {
    const event = req.body;
    console.log("📬 Incoming Square webhook:", event.type, event.event_id);

    if (!event.type?.startsWith("payment.")) return res.status(200).send("Ignored");

    const payment = event.data?.object?.payment;
    if (!payment) return res.status(200).send("Ignored");
    if (payment.status !== "COMPLETED") return res.status(200).send("Ignored");

    const { sku, username } = await extractPaymentDetails(payment);

    if (!username) {
      console.warn("⚠️ No username found in payment/order");
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

    // Prevent double-credit
    const existingUser = await User.findOne({ "purchases.paymentId": payment.id });
    if (existingUser) {
      console.warn(`⚠️ Payment ${payment.id} already processed for ${username}`);
      return res.status(200).send("Already processed");
    }

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
