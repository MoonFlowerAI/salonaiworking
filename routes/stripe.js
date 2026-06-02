/**
 * Stripe routes:
 *   POST /api/stripe/webhook            — Stripe → us (raw body, signature-verified)
 *   POST /api/stripe/deposit-session    — customer → us (create Checkout session for an appointment)
 *
 * The webhook route applies express.raw() on itself so we don't need to care
 * about its ordering relative to the global express.json() middleware.
 */

const express = require('express');
const router = express.Router();
const { readCollection, writeCollection } = require('../db');
const stripeLib = require('../lib/stripe');

async function brevoSend({ from, to, subject, html }) {
  const fromMatch = from.match(/"?([^"<]*)"?\s*<([^>]+)>/);
  const sender = fromMatch ? { name: fromMatch[1].trim(), email: fromMatch[2].trim() } : { email: from };
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender, to: [{ email: to }], subject, htmlContent: html }),
  });
  if (!res.ok) console.error('[stripe] brevo error:', res.status, await res.text().catch(() => ''));
}

// Webhook — Stripe posts here when a Checkout session completes.
router.post('/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    if (!stripeLib.isEnabled()) return res.status(503).send('Stripe not configured');

    const signature = req.headers['stripe-signature'];
    let event;
    try {
      event = stripeLib.constructWebhookEvent(req.body, signature);
    } catch (err) {
      console.error('[stripe webhook] signature verification failed:', err.message);
      return res.status(400).send(`Webhook error: ${err.message}`);
    }
    if (!event) return res.status(400).send('Unable to parse event');

    try {
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const appointmentId = session.metadata && session.metadata.appointmentId;
        const tenantId = (session.metadata && session.metadata.tenantId) || undefined; // undefined → default tenant
        if (!appointmentId) {
          console.warn('[stripe webhook] session has no appointmentId metadata:', session.id);
          return res.json({ received: true, note: 'no appointmentId' });
        }

        const sessionType = session.metadata && session.metadata.type;

        if (sessionType === 'signup') {
          // Signup token payment
          const { intakeId, tier, salonName } = session.metadata || {};
          console.log(`[stripe webhook] signup token paid — tier=${tier} salon="${salonName}" intakeId=${intakeId} amount=${session.amount_total}`);

          // Notify operator
          try {
            await brevoSend({
              from: '"MoonFlower AI" <hello@moonflowerai.com>',
              to: 'hello@moonflowerai.com',
              subject: `💰 Signup Token Paid: ${salonName} (${tier})`,
              html: `<div style="font-family:Arial,sans-serif;padding:20px;">
                <h2>New Signup Token Received</h2>
                <p><strong>Salon:</strong> ${salonName}</p>
                <p><strong>Plan:</strong> ${tier}</p>
                <p><strong>Amount:</strong> $${(session.amount_total / 100).toFixed(2)}</p>
                <p><strong>Customer email:</strong> ${session.customer_email || 'N/A'}</p>
                <p><strong>Intake ID:</strong> ${intakeId || 'N/A'}</p>
                <p><strong>Stripe session:</strong> ${session.id}</p>
                <p>Next steps: schedule kickoff call + send contract.</p>
              </div>`
            });
            // Confirmation to client
            if (session.customer_email) {
              await brevoSend({
                from: '"MoonFlower AI" <hello@moonflowerai.com>',
                to: session.customer_email,
                subject: `MoonFlower AI — Setup Token Received`,
                html: `<div style="font-family:Arial,sans-serif;padding:20px;max-width:500px;">
                  <h2 style="color:#7c3aed;">You're in!</h2>
                  <p>Hi ${salonName},</p>
                  <p>We received your $${(session.amount_total / 100).toFixed(2)} setup token for the <strong>${tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : ''} Plan</strong>.</p>
                  <p>This is nonrefundable and applied toward your total setup fee.</p>
                  <p>Expect an email from us within 1 business day with:</p>
                  <ul><li>Your kickoff call link</li><li>Your service agreement for e-signature</li></ul>
                  <p>Questions? Reply to this email or reach us at <a href="mailto:hello@moonflowerai.com">hello@moonflowerai.com</a>.</p>
                  <p>— The MoonFlower AI Team</p>
                </div>`
              });
            }
          } catch (emailErr) {
            console.error('[stripe webhook] signup email error:', emailErr.message);
          }
        } else {
          // Appointment deposit (original flow)
          const appointments = await readCollection('appointments', tenantId) || [];
          const idx = appointments.findIndex(a => a.id === appointmentId);
          if (idx !== -1) {
            appointments[idx].deposit = {
              status: 'paid',
              amount: session.amount_total,
              currency: session.currency,
              stripeSessionId: session.id,
              paidAt: new Date().toISOString()
            };
            await writeCollection('appointments', appointments, tenantId);
            console.log(`[stripe webhook] deposit paid for ${appointmentId} (tenant=${tenantId || 'default'})`);
          }
        }
      }
      res.json({ received: true });
    } catch (err) {
      console.error('[stripe webhook] handler error:', err);
      res.status(500).send('Handler error');
    }
  }
);

// POST /api/stripe/deposit-session
// Body: { appointmentId }
// Creates a Checkout session for the deposit on an existing booking.
router.post('/deposit-session', express.json(), async (req, res) => {
  try {
    if (!stripeLib.isEnabled()) {
      return res.status(503).json({ error: 'Stripe is not configured on this server.' });
    }

    const { appointmentId } = req.body || {};
    if (!appointmentId) return res.status(400).json({ error: 'appointmentId required' });

    const appointments = await readCollection('appointments', req.tenantId) || [];
    const appt = appointments.find(a => a.id === appointmentId);
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    if (appt.deposit && appt.deposit.status === 'paid') {
      return res.status(400).json({ error: 'Deposit already paid' });
    }

    const services = await readCollection('services', req.tenantId) || [];
    const service = services.find(s => s.id === appt.serviceId);
    const depositAmount = (service && service.depositAmount) ? service.depositAmount : 20; // default $20
    const amountCents = Math.round(depositAmount * 100);

    const result = await stripeLib.createDepositSession({
      appointmentId: appt.id,
      amountCents,
      description: `Deposit for ${appt.serviceName}`,
      customerEmail: appt.customerEmail,
      tenantId: req.tenantId
    });

    if (!result.enabled) return res.status(503).json({ error: 'Stripe disabled' });
    if (result.error) return res.status(500).json({ error: result.error });

    // Mark the appointment as awaiting deposit
    const idx = appointments.findIndex(a => a.id === appointmentId);
    if (idx !== -1) {
      appointments[idx].deposit = {
        ...(appointments[idx].deposit || {}),
        status: 'pending',
        amount: amountCents,
        currency: 'usd',
        stripeSessionId: result.sessionId
      };
      await writeCollection('appointments', appointments, req.tenantId);
    }

    res.json({ url: result.url, sessionId: result.sessionId });
  } catch (err) {
    console.error('[stripe] deposit-session error:', err);
    res.status(500).json({ error: 'Failed to create deposit session' });
  }
});

// POST /api/stripe/signup-session
// Body: { tier, salonName, ownerEmail, intakeId }
router.post('/signup-session', express.json(), async (req, res) => {
  try {
    if (!stripeLib.isEnabled()) {
      return res.status(503).json({ error: 'Stripe is not configured on this server.' });
    }
    const { tier, salonName, ownerEmail, intakeId } = req.body || {};
    if (!ownerEmail) return res.status(400).json({ error: 'ownerEmail required' });
    const validTier = ['basic', 'pro', 'premium'].includes(tier) ? tier : 'basic';
    const result = await stripeLib.createSignupSession({ tier: validTier, salonName, ownerEmail, intakeId });
    if (!result.enabled) return res.status(503).json({ error: 'Stripe disabled' });
    if (result.error) return res.status(500).json({ error: result.error });
    res.json({ url: result.url, sessionId: result.sessionId });
  } catch (err) {
    console.error('[stripe] signup-session error:', err);
    res.status(500).json({ error: 'Failed to create signup session' });
  }
});

module.exports = router;
