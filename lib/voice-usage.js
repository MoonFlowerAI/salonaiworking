/**
 * Voice usage tracking — records completed Twilio calls and tracks monthly minutes.
 *
 * Uses the `collections` table (same as everything else).
 * Collection key: `voice_usage:<tenantId>:<YYYY-MM>`
 *
 * Schema stored in JSONB:
 *   { tenantId, month, calls: [ { callSid, seconds, recordedAt, meta } ], totalSeconds }
 *
 * Monthly caps by tier (minutes):
 *   basic: 60, pro: 200, premium: 500
 */

const { readCollection, writeCollection } = require('../db');

const TIER_CAPS = { basic: 60, pro: 200, premium: 500 };
const DEFAULT_TIER = 'premium';

function currentMonth() {
  return new Date().toISOString().slice(0, 7); // "YYYY-MM"
}

function collectionKey(tenantId, month) {
  return `voice_usage:${tenantId || 'default'}:${month}`;
}

/**
 * Record a completed voice call.
 * Returns the updated usage row with minutesUsed and minutesCap.
 */
async function recordVoiceCall({ tenantId = 'default', seconds = 0, tier = DEFAULT_TIER, meta = {} }) {
  const month = currentMonth();
  const key = collectionKey(tenantId, month);

  const existing = await readCollection(key) || { tenantId, month, calls: [], totalSeconds: 0 };

  const call = {
    callSid: meta.callSid || null,
    from: meta.from || null,
    to: meta.to || null,
    seconds,
    recordedAt: new Date().toISOString(),
  };

  existing.calls.push(call);
  existing.totalSeconds = (existing.totalSeconds || 0) + seconds;

  await writeCollection(key, existing);

  const cap = TIER_CAPS[tier] || TIER_CAPS[DEFAULT_TIER];
  return {
    tenantId,
    month,
    minutesUsed: Math.round(existing.totalSeconds / 60 * 10) / 10,
    minutesCap: cap,
    totalSeconds: existing.totalSeconds,
  };
}

/**
 * Get current month usage status for a tenant.
 */
async function getUsageStatus({ tenantId = 'default', tier = DEFAULT_TIER } = {}) {
  const month = currentMonth();
  const key = collectionKey(tenantId, month);

  const data = await readCollection(key) || { totalSeconds: 0, calls: [] };
  const cap = TIER_CAPS[tier] || TIER_CAPS[DEFAULT_TIER];
  const minutesUsed = Math.round(data.totalSeconds / 60 * 10) / 10;

  return {
    tenantId,
    month,
    minutesUsed,
    minutesCap: cap,
    callCount: (data.calls || []).length,
    percentUsed: cap > 0 ? Math.min(100, Math.round(minutesUsed / cap * 100)) : 0,
    overLimit: minutesUsed >= cap,
  };
}

module.exports = { recordVoiceCall, getUsageStatus, TIER_CAPS };
