// netlify/functions/stripe-webhook.js
// Receives Stripe subscription events and updates Supabase pro status

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ibpiafqyimvcbbzhvsox.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

exports.handler = async (event) => {
  // Only accept POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let stripeEvent;

  // Verify webhook signature if secret is set
  if (STRIPE_WEBHOOK_SECRET) {
    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const sig = event.headers['stripe-signature'];
      stripeEvent = stripe.webhooks.constructEvent(
        event.body,
        sig,
        STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return { statusCode: 400, body: `Webhook Error: ${err.message}` };
    }
  } else {
    // No secret set — parse raw body (for initial testing)
    try {
      stripeEvent = JSON.parse(event.body);
    } catch (err) {
      return { statusCode: 400, body: 'Invalid JSON' };
    }
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const subscription = stripeEvent.data.object;
  const customerEmail = subscription.customer_email ||
    (subscription.customer_details && subscription.customer_details.email);

  console.log('Stripe event:', stripeEvent.type, 'customer:', customerEmail);

  try {
    switch (stripeEvent.type) {

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        // Mark user as pro in Supabase
        const isActive = ['active', 'trialing'].includes(subscription.status);
        if (customerEmail) {
          const { error } = await supabase
            .from('profiles')
            .update({
              is_pro: isActive,
              stripe_customer_id: subscription.customer,
              stripe_subscription_id: subscription.id,
              subscription_status: subscription.status,
              pro_since: isActive ? new Date().toISOString() : null,
            })
            .eq('email', customerEmail);
          if (error) console.error('Supabase update error:', error);
          else console.log('Updated pro status for', customerEmail, ':', isActive);
        }
        break;
      }

      case 'customer.subscription.deleted':
      case 'customer.subscription.paused': {
        // Remove pro status
        if (customerEmail) {
          const { error } = await supabase
            .from('profiles')
            .update({
              is_pro: false,
              subscription_status: stripeEvent.type === 'customer.subscription.paused' ? 'paused' : 'cancelled',
            })
            .eq('email', customerEmail);
          if (error) console.error('Supabase update error:', error);
          else console.log('Removed pro status for', customerEmail);
        }
        break;
      }

      default:
        console.log('Unhandled event type:', stripeEvent.type);
    }
  } catch (err) {
    console.error('Error processing webhook:', err);
    return { statusCode: 500, body: 'Internal server error' };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ received: true }),
  };
};
