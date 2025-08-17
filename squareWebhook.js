const User = require("./models/user");
const { sendThankYouEmail } = require("./emails");

const skuMap = {
  tokens_400: 400,
  tokens_1000: 1000,
  tokens_2000: 2000,
  tokens_4000: 4000,
  tokens_10000: 10000,
};

// Map real catalogObjectIds to SKU keys
const catalogSkuMap = {
  "CATALOG_OBJ_ID_400": "tokens_400",
  "CATALOG_OBJ_ID_1000": "tokens_1000",
  "CATALOG_OBJ_ID_2000": "tokens_2000",
  "CATALOG_OBJ_ID_4000": "tokens_4000",
  "CATALOG_OBJ_ID_10000": "tokens_10000",
};

// Helper to normalize names for matching
const normalize = (str) => str?.toLowerCase().replace(/\s+/g, "_");

const extractPaymentDetails = async (payment, ordersApi) => {
  let sku = null;
  let username = null;

  console.log("🔍 Extracting payment details:", payment.id);

  // 1️⃣ Check payment metadata
  if (payment.metadata) {
    username = payment.metadata.username || username;
    sku = payment.metadata.sku || sku;
    if (sku) console.log("✅ SKU from payment metadata:", sku);
  }

  // 2️⃣ Check payment note (JSON or "username-sku")
  if ((!username || !sku) && payment.note) {
    try {
      const noteData = JSON.parse(payment.note);
      username = username || noteData.username;
      sku = sku || noteData.sku;
      if (sku) console.log("✅ SKU from payment note JSON:", sku);
    } catch {
      const match = payment.note.match(/(\w+)-(\w+)/);
      if (match) {
        username = username || match[1];
        sku = sku || match[2];
        if (sku) console.log("✅ SKU from payment note pattern:", sku);
      }
    }
  }

  // 3️⃣ Check referenceId
  if ((!username || !sku) && payment.referenceId) {
    const parts = payment.referenceId.split("-");
    if (!username && parts[0]) username = parts[0];
    if (!sku && parts[1]) sku = parts[1];
    if (sku) console.log("✅ SKU from referenceId:", sku);
  }

  // 4️⃣ Fetch order if still missing anything
  if ((!username || !sku) && payment.orderId) {
    try {
      const { result } = await ordersApi.retrieveOrder(payment.orderId);
      const lineItem = result?.order?.lineItems?.[0];

      console.log("📦 Order line items:", JSON.stringify(result.order?.lineItems, null, 2));

      if (lineItem) {
        // 4a️⃣ Check line item metadata
        if (lineItem.metadata) {
          username = username || lineItem.metadata.username;
          sku = sku || lineItem.metadata.sku;
          if (sku) console.log("✅ SKU from line item metadata:", sku);
        }

        // 4b️⃣ Check line item note
        if ((!username || !sku) && lineItem.note) {
          try {
            const noteData = JSON.parse(lineItem.note);
            username = username || noteData.username;
            sku = sku || noteData.sku;
            if (sku) console.log("✅ SKU from line item note JSON:", sku);
          } catch {
            const match = lineItem.note.match(/(\w+)-(\w+)/);
            if (match) {
              username = username || match[1];
              sku = sku || match[2];
              if (sku) console.log("✅ SKU from line item note pattern:", sku);
            }
          }
        }

        // 4c️⃣ Name / variationName
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

        // 4d️⃣ CatalogObjectId
        if (!sku && lineItem.catalogObjectId) {
          sku = catalogSkuMap[lineItem.catalogObjectId] || sku;
          if (sku) console.log("✅ SKU from catalogObjectId:", sku);
        }
      }
    } catch (err) {
      console.error("❌ Error fetching order:", err);
    }
  }

  // 5️⃣ Last resort: use buyer email as username
  if (!username && payment.buyer_email_address) {
    username = payment.buyer_email_address;
    console.log("✅ Username fallback to buyer email:", username);
  }

  console.log("🏷 Final extracted details:", { sku, username });
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
