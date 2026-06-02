/**
 * SMS wrapper around Twilio.
 *
 * Env-gated: if TWILIO_* env vars are missing OR the twilio package isn't
 * installed, sendSms() becomes a warning-logging no-op so the app still runs.
 *
 * Required env vars when enabled:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_FROM_NUMBER   (e.g. "+15025551234")
 */

let twilioClient = null;
let twilioInitAttempted = false;

function getClient() {
  if (twilioInitAttempted) return twilioClient;
  twilioInitAttempted = true;

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    console.warn('[sms] Twilio env vars not set — SMS disabled.');
    return null;
  }

  try {
    const twilio = require('twilio');
    twilioClient = twilio(sid, token);
    console.log('[sms] Twilio client initialized.');
    return twilioClient;
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND') {
      console.warn('[sms] twilio package not installed — SMS disabled. Run: npm install twilio');
    } else {
      console.error('[sms] Failed to initialize Twilio client:', err.message);
    }
    return null;
  }
}

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/[^\d+]/g, '');
  if (!digits) return null;
  // If user gave us just 10 digits, assume US
  if (/^\d{10}$/.test(digits)) return '+1' + digits;
  // If they already included the + or country code
  if (digits.startsWith('+')) return digits;
  if (/^\d{11,15}$/.test(digits)) return '+' + digits;
  return null;
}

/**
 * Send an SMS. Resolves to { sent: boolean, reason?: string, sid?: string }.
 * Never throws — caller doesn't need to try/catch.
 */
async function sendSms(to, body) {
  const client = getClient();
  if (!client) return { sent: false, reason: 'sms_disabled' };

  const from = process.env.TWILIO_FROM_NUMBER;
  if (!from) {
    console.warn('[sms] TWILIO_FROM_NUMBER not set — cannot send SMS.');
    return { sent: false, reason: 'no_from_number' };
  }

  const normalized = normalizePhone(to);
  if (!normalized) {
    return { sent: false, reason: 'invalid_to_number' };
  }

  try {
    const msg = await client.messages.create({ from, to: normalized, body });
    console.log(`[sms] Sent to ${normalized} (sid=${msg.sid})`);
    return { sent: true, sid: msg.sid };
  } catch (err) {
    console.error(`[sms] Send failed to ${normalized}:`, err.message);
    return { sent: false, reason: err.message };
  }
}

function isEnabled() {
  return getClient() !== null && !!process.env.TWILIO_FROM_NUMBER;
}

module.exports = { sendSms, isEnabled, normalizePhone };
