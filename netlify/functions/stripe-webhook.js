// netlify/functions/stripe-webhook.js
// Receives Stripe subscription events and updates Supabase pro status

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ibpiafqyimvcbbzhvsox.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let stripeEvent;

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
    try {
      stripeEvent = JSON.parse(event.body);
    } catch (err) {
      return
