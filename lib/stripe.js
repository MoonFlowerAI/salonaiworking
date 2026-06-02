/**
 * Stripe wrapper for deposit / no-show protection.
 *
 * Env-gated: if STRIPE_SECRET_KEY is missing OR the stripe package isn't
 * installed, the helpers return { enabled: false }. The app still runs fine.
 *
 * Required env vars when enabled:
 *   STRIPE_SECRET_KEY          (sk_live_... or sk_test_...)
 *   STRIPE_WEBHOOK_SECRET      (whsec_... — optional but recommended)
 *   PUBLIC_URL                 (e.g. https://yoursalon.com — used for success/cancel URLs)
 */

let stripeClient = null;
let initAttempted = false;

function getClient() {
  if (initAttempted) return stripeClient;
  initAttempted = true;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.warn('[stripe] STRIPE_SECRET_KEY not set — Stripe disabled.');
    return null;
  }
  try {
    const Stripe = require('stripe');
    stripeClient = Stripe(key);
    console.log('[stripe] Stripe client initialized.');
    return stripeClient;
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND') {
      console.warn('[stripe] stripe package not installed — Stripe disabled. Run: npm install stripe');
    } else {
      console.error('[stripe] Failed to initialize:', err.message);
    }
    return null;
  }
}

function isEnabled() {
  return getClient() !== null;
}

/**
 * Creates a Stripe Checkout session for a deposit.
 * Returns { enabled: boolean, url?: string, sessionId?: string, error?: string }.
 */
async function createDepositSession({ appointmentId, amountCents, description, customerEmail, tenantId }) {
  const client = getClient();
  if (!client) return { enabled: false };

  const publicUrl = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
  if (!publicUrl) {
    return { enabled: true, error: 'PUBLIC_URL not set' };
  }

  // BASE_PATH: the subpath the app is mounted under (e.g. /salonai when proxied).
  // Leave empty or unset when running at root.
  const basePath = (process.env.BASE_PATH || '').replace(/\/$/, '');

  // For multi-tenant deployments, URLs include the /t/<tenant> prefix so
  // after Stripe redirects back, the SPA loads with the right tenant context.
  const tenantPath = tenantId && tenantId !== 'default' ? `/t/${tenantId}` : '';

  try {
    const session = await client.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: customerEmail,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: amountCents,
          product_data: {
            name: description || 'Booking deposit',
            description: 'Refundable deposit to hold your appointment'
          }
        }
      }],
      metadata: { appointmentId, tenantId: tenantId || 'default' },
      success_url: `${publicUrl}${basePath}${tenantPath}/#appointments?deposit=success&apt=${encodeURIComponent(appointmentId)}`,
      cancel_url: `${publicUrl}${basePath}${tenantPath}/#appointments?deposit=cancelled&apt=${encodeURIComponent(appointmentId)}`
    });
    return { enabled: true, url: session.url, sessionId: session.id };
  } catch (err) {
    console.error('[stripe] createDepositSession failed:', err.message);
    return { enabled: true, error: err.message };
  }
}

/**
 * Verifies webhook signature and returns the parsed event.
 * Pass in the raw request body (Buffer) and the Stripe-Signature header.
 */
function constructWebhookEvent(rawBody, signature) {
  const client = getClient();
  if (!client) return null;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('[stripe] STRIPE_WEBHOOK_SECRET not set — cannot verify webhook.');
    return null;
  }
  return client.webhooks.constructEvent(rawBody, signature, secret);
}

const SIGNUP_TOKENS = {
  basic:   18000,  // $180
  pro:     30000,  // $300
  premium: 40000,  // $400
};

/**
 * Creates a Stripe Checkout session for a signup token (20% nonrefundable setup fee).
 * Returns { enabled: boolean, url?: string, sessionId?: string, error?: string }.
 */
async function createSignupSession({ tier, salonName, ownerEmail, intakeId }) {
  const client = getClient();
  if (!client) return { enabled: false };

  const publicUrl = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
  if (!publicUrl) return { enabled: true, error: 'PUBLIC_URL not set' };
  const basePath = (process.env.BASE_PATH || '').replace(/\/$/, '');

  const amountCents = SIGNUP_TOKENS[tier] || SIGNUP_TOKENS.basic;
  const tierLabel = tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : 'Basic';

  try {
    const session = await client.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: ownerEmail,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: amountCents,
          product_data: {
            name: `MoonFlower AI — ${tierLabel} Plan Setup Token`,
            description: 'Nonrefundable 20% setup token to begin onboarding. Applied toward your total setup fee.'
          }
        }
      }],
      metadata: { type: 'signup', intakeId: intakeId || '', tier, salonName: salonName || '' },
      success_url: `${publicUrl}${basePath}/thank-you.html?tier=${tier}&salon=${encodeURIComponent(salonName || '')}`,
      cancel_url: `${publicUrl}${basePath}/intake.html?tier=${tier}&cancelled=1`
    });
    return { enabled: true, url: session.url, sessionId: session.id };
  } catch (err) {
    console.error('[stripe] createSignupSession failed:', err.message);
    return { enabled: true, error: err.message };
  }
}

module.exports = { getClient, isEnabled, createDepositSession, createSignupSession, constructWebhookEvent };
