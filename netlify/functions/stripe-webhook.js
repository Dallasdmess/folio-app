const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://ibpiafqyimvcbbzhvsox.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  let stripeEvent;
  if (STRIPE_WEBHOOK_SECRET) {
    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const sig = event.headers['stripe-signature'];
      stripeEvent = stripe.webhooks.constructEvent(event.body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      return { statusCode: 400, body: 'Webhook Error: ' + err.message };
    }
  } else {
    try { stripeEvent = JSON.parse(event.body); }
    catch (err) { return { statusCode: 400, body: 'Invalid JSON' }; }
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const subscription = stripeEvent.data.object;
  const customerEmail = subscription.customer_email || (subscription.customer_details && subscription.customer_details.email);
  try {
    switch (stripeEvent.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const isActive = ['active', 'trialing'].includes(subscription.status);
        if (customerEmail) {
          await supabase.from('profiles').update({
            is_pro: isActive,
            stripe_customer_id: subscription.customer,
            stripe_subscription_id: subscription.id,
            subscription_status: subscription.status,
            pro_since: isActive ? new Date().toISOString() : null,
          }).eq('email', customerEmail);
        }
        break;
      }
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused': {
        if (customerEmail) {
          await supabase.from('profiles').update({
            is_pro: false,
            subscription_status: stripeEvent.type === 'customer.subscription.paused' ? 'paused' : 'cancelled',
          }).eq('email', customerEmail);
        }
        break;
      }
    }
  } catch (err) {
    return { statusCode: 500, body: 'Internal server error' };
  }
  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
