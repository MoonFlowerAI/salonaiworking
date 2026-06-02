/**
 * Voice AI routes.
 *
 *   POST /api/voice/twilio/status-callback   — Twilio status callback when
 *                                              a call ends. Records the
 *                                              duration into voice-usage.
 *   GET  /api/voice/usage                    — Tenant's current month usage.
 *                                              (Tenant resolution from
 *                                              tenantMiddleware as usual.)
 *
 * Twilio statusCallback is configured on each Premium tenant's phone number.
 * The callback URL must include the tenant slug:
 *   https://salonai-production.up.railway.app/t/<slug>/api/voice/twilio/status-callback
 * tenantMiddleware strips /t/<slug> and sets req.tenantId for us.
 *
 * When a call ends Twilio POSTs CallDuration (seconds), CallSid, From, To,
 * and CallStatus to this endpoint.
 */

const express = require('express');
const router = express.Router();

const { recordVoiceCall, getUsageStatus } = require('../lib/voice-usage');

/**
 * Twilio "status callback" — fires when a call reaches a terminal state.
 * Twilio sends application/x-www-form-urlencoded by default.
 */
router.post('/twilio/status-callback', express.urlencoded({ extended: false }), async (req, res) => {
  const body = req.body || {};
  const callStatus = body.CallStatus;
  // Only count completed calls (not no-answer / busy / failed)
  if (callStatus !== 'completed') {
    return res.status(204).end();
  }

  const seconds = parseInt(body.CallDuration, 10);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return res.status(204).end();
  }

  // Tenant comes from the URL prefix /t/<slug>/api/voice/... — set on the
  // Twilio statusCallback URL during tenant onboarding.
  const tenantId = req.tenantId || 'default';

  try {
    const row = await recordVoiceCall({
      tenantId,
      seconds,
      tier: 'premium',
      meta: {
        callSid: body.CallSid,
        from: body.From,
        to: body.To,
      },
    });
    return res.json({ ok: true, minutesUsed: row.minutesUsed });
  } catch (err) {
    console.error('[voice] failed to record call:', err);
    return res.status(500).json({ error: 'record-failed' });
  }
});

/**
 * GET /api/voice/usage — current month for the resolved tenant.
 * Used by the admin dashboard to render a usage bar.
 */
router.get('/usage', async (req, res) => {
  try {
    const status = await getUsageStatus({
      tenantId: req.tenantId,
      tier: req.query.tier || 'premium',
    });
    res.json(status);
  } catch (err) {
    console.error('[voice] usage read error:', err);
    res.status(500).json({ error: 'usage-read-failed' });
  }
});

module.exports = router;
