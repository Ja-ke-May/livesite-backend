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
tokens_: 1000000,
};

// Map real catalogObjectIds to SKU keys
const catalogSkuMap = {
  "CATALOG_OBJ_ID_400": "tokens_400",
  "CATALOG_OBJ_ID_1000": "tokens_1000",
  "CATALOG_OBJ_ID_2000": "tokens_2000",
  "CATALOG_OBJ_ID_4000": "tokens_4000",
  "CATALOG_OBJ_ID_10000": "tokens_10000",
   "CATALOG_OBJ_ID_50000": "tokens_50000",
  "CATALOG_OBJ_ID_150000": "tokens_150000",
  "CATALOG_OBJ_ID_400000": "tokens_400000",
  "CATALOG_OBJ_ID_1000000": "tokens_1000000",
};

  

// Square client
const squareClient = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: process.env.SQUARE_ENVIRONMENT || "production",
});

// Helper to normalize names for matching
const normalize = (str) => str?.toLowerCase().replace(/\s+/g, "_");

// Extract username, SKU, and purchaseId from payment object
const extractPaymentDetails = async (payment, ordersApi) => {
  let sku = null;
  let username = null;
  let purchaseId = null;

  console.log("🔍 Extracting payment details:", payment.id);

  // 1️⃣ Metadata
  if (payment.metadata) {
    username = payment.metadata.username || username;
    sku = payment.metadata.sku || sku;
    purchaseId = payment.metadata.purchaseId || purchaseId;
    if (sku) console.log("✅ SKU from payment metadata:", sku);
  }

  // 2️⃣ Payment note (JSON or "username-sku-purchaseId")
  if ((!username || !sku || !purchaseId) && payment.note) {
    try {
      const noteData = JSON.parse(payment.note);
      username = username || noteData.username;
      sku = sku || noteData.sku;
      purchaseId = purchaseId || noteData.purchaseId;
      if (sku) console.log("✅ SKU from payment note JSON:", sku);
    } catch {
      const match = payment.note.match(/(\w+)-(\w+)-([\w-]+)/);
      if (match) {
        username = username || match[1];
        sku = sku || match[2];
        purchaseId = purchaseId || match[3];
        if (sku) console.log("✅ SKU from payment note pattern:", sku);
      }
    }
  }

  // 3️⃣ ReferenceId
  if ((!username || !sku || !purchaseId) && payment.referenceId) {
    const parts = payment.referenceId.split("-");
    if (!username && parts[0]) username = parts[0];
    if (!sku && parts[1]) sku = parts[1];
    if (!purchaseId && parts.slice(2).length) purchaseId = parts.slice(2).join("-");
    if (sku) console.log("✅ SKU from referenceId:", sku);
  }

  // 4️⃣ Fetch order if still missing anything
  if ((!username || !sku || !purchaseId) && payment.orderId && ordersApi) {
    try {
      const { result } = await ordersApi.retrieveOrder(payment.orderId);
      const lineItem = result?.order?.lineItems?.[0];

      console.log("📦 Order line items:", JSON.stringify(result.order?.lineItems, null, 2));

      if (lineItem) {
        if (lineItem.metadata) {
          username = username || lineItem.metadata.username;
          sku = sku || lineItem.metadata.sku;
          purchaseId = purchaseId || lineItem.metadata.purchaseId;
          if (sku) console.log("✅ SKU from line item metadata:", sku);
        }

        if ((!username || !sku || !purchaseId) && lineItem.note) {
          try {
            const noteData = JSON.parse(lineItem.note);
            username = username || noteData.username;
            sku = sku || noteData.sku;
            purchaseId = purchaseId || noteData.purchaseId;
            if (sku) console.log("✅ SKU from line item note JSON:", sku);
          } catch {
            const match = lineItem.note.match(/(\w+)-(\w+)-([\w-]+)/);
            if (match) {
              username = username || match[1];
              sku = sku || match[2];
              purchaseId = purchaseId || match[3];
              if (sku) console.log("✅ SKU from line item note pattern:", sku);
            }
          }
        }

        if (!sku && lineItem.name) {
          const normalizedName = normalize(lineItem.name);
          sku = Object.keys(skuMap).find((key) => normalizedName.includes(key));
          if (sku) console.log("✅ SKU from line item name:", sku);
        }

        if (!sku && lineItem.variationName) {
          const normalizedVariation = normalize(lineItem.variationName);
          sku = Object.keys(skuMap).find((key) => normalizedVariation.includes(key));
          if (sku) console.log("✅ SKU from line item variationName:", sku);
        }

        if (!sku && lineItem.catalogObjectId) {
          sku = catalogSkuMap[lineItem.catalogObjectId] || sku;
          if (sku) console.log("✅ SKU from catalogObjectId:", sku);
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

    // Pass ordersApi so extractPaymentDetails can fetch line items
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
    const amountSpent = payment.amountMoney?.amount
      ? payment.amountMoney.amount / 100
      : 0;

    // Prevent double-credit using purchaseId if available, else fallback to payment.id
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
      {
        $inc: { tokens },
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

    console.log(`✅ ${username} credited with ${tokens} tokens (Payment ID: ${payment.id}, Purchase ID: ${purchaseId})`);
    res.status(200).send("Processed");
  } catch (err) {
    console.error("❌ Square webhook error:", err);
    res.status(500).send("Server error");
  }
};

module.exports = handleSquareWebhook;
