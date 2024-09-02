const Stripe = require('stripe');
const User = require('./models/user');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-06-20',
});

const endpointSecret = process.env.WEBHOOK_SECRET;

const calculateTokens = (lineItems) => {
    let totalTokens = 0;
    lineItems.data.forEach(item => {
        switch (item.description) {
            case '400 Tokens':
                totalTokens += 400;
                break;
            case '1000 Tokens':
                totalTokens += 1000;
                break;
            case '2000 Tokens':
                totalTokens += 2000;
                break;
            case '4000 Tokens':
                totalTokens += 4000;
                break;
            case '10000 Tokens':
                totalTokens += 10000;
                break;
            default:
                console.warn(`Unrecognized item description: ${item.description}`);
                break;
        }
    });
    return totalTokens;
};

const handleStripeWebhook = async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        console.error(`Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const sessionWithLineItems = await stripe.checkout.sessions.retrieve(session.id, {
            expand: ['line_items'],
        });

        const lineItems = sessionWithLineItems.line_items;
        if (!lineItems) {
            console.error('No line items found for the session');
            return res.status(500).send('Internal Server Error');
        }

        const totalTokens = calculateTokens(lineItems);
        const { email } = sessionWithLineItems.customer_details;

        try {
            const user = await User.findOneAndUpdate(
                { email: email }, 
                { $inc: { tokens: totalTokens }, $set: { lastPurchaseAmount: session.amount_total / 100 } },
                { new: true }
            );

            if (!user) {
                console.error(`User with email ${email} not found.`);
                return res.status(404).send('User not found');
            }

            console.log(`Successfully updated user ${email} with ${totalTokens} tokens.`);
            res.status(200).send('Purchase processed successfully');
        } catch (error) {
            console.error('Error updating user after purchase:', error);
            res.status(500).send('Error updating user after purchase');
        }
    } else {
        res.status(200).send('Event not handled');
    }
};

module.exports = handleStripeWebhook;
