const { Client } = require("square");
const User = require("./models/user");
const { sendThankYouEmail } = require("./emails");

const skuMap = {
  tokens_400: 800,
  tokens_1000: 2000,
  tokens_2000: 4000,
  tokens_4000: 8000,
  tokens_10000: 20000,
  tokens_50000: 100000,
  tokens_150000: 300000,
  tokens_400000: 800000,
  tokens_1000000: 2000000,
};

const squareClient = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: process.env.SQUARE_ENVIRONMENT || "production",
});


function parseMoney(amountMoney) {
  if (!amountMoney || amountMoney.amount == null) return 0;
  return Number(amountMoney.amount) / 100;
}


const extractPaymentDetails = async (payment, ordersApi) => {
  let sku = null;
  let username = null;
  let shortId = null;

  if (payment.orderId) {
    try {
      const { result } = await ordersApi.retrieveOrder(payment.orderId);
      const orderRef = result?.order?.referenceId;

      if (orderRef) {
        const parts = orderRef.split("-");
        username = parts[0] || null;
        sku = parts[1] || null;
        shortId = parts[2] || null;
      }
    } catch (err) {
      console.error("❌ Error fetching order:", err);
    }
  }

  return { sku, username, shortId };
};


const handleSquareWebhook = async (req, res) => {
  try {
    const event = req.body;

    if (!event.type?.startsWith("payment.")) {
      return res.status(200).send("Ignored");
    }

    const webhookPayment = event.data?.object?.payment;
    if (!webhookPayment) return res.status(200).send("Ignored");

    
    let fullPayment;
    try {
      const { result } = await squareClient.paymentsApi.getPayment(webhookPayment.id);
      fullPayment = result.payment;
    } catch (err) {
      console.error("❌ Failed to fetch full payment:", err);
      return res.status(500).send("Square payment fetch failed");
    }

    if (fullPayment.status !== "COMPLETED") return res.status(200).send("Ignored");

    
    const { sku, username, shortId } = await extractPaymentDetails(
      fullPayment,
      squareClient.ordersApi
    );

    if (!username || !sku || !skuMap[sku]) return res.status(200).send("Ignored");

    const tokens = Number(skuMap[sku]);
    const amountSpent = parseMoney(fullPayment.amountMoney);
    const purchaseId = `${fullPayment.id}-${shortId || "noid"}`;

    
    const existingUser = await User.findOne({
      $or: [
        { "purchases.paymentId": fullPayment.id },
        { "purchases.purchaseId": purchaseId },
      ],
    });

    if (existingUser) return res.status(200).send("Already processed");

    const newPurchase = {
      date: new Date(),
      tokens,
      amountSpent,
      currency: fullPayment.amountMoney?.currency || "GBP",
      description: "Token Purchase",
      paymentId: fullPayment.id,
      purchaseId,
    };

    const user = await User.findOneAndUpdate(
      { userName: username },
      { $inc: { tokens }, $push: { purchases: newPurchase } },
      { new: true }
    );

    if (!user) return res.status(200).send("Ignored");

    sendThankYouEmail(user, newPurchase).catch((err) =>
      console.error("❌ Email error:", err)
    );

    console.log(`✅ ${username} credited with ${tokens} tokens`);
    res.status(200).send("Processed");
  } catch (err) {
    console.error("❌ Square webhook error:", err);
    res.status(500).send("Server error");
  }
};

module.exports = handleSquareWebhook;
