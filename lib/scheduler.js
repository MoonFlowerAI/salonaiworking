/**
 * Appointment reminder + review-request scheduler.
 *
 * Runs on an interval (default every 10 minutes). On each tick:
 *   - Sends a 24h reminder SMS for appointments within T+23h to T+25h window.
 *   - Sends a 2h reminder SMS for appointments within T+1h to T+3h window.
 *   - Sends a review request SMS for completed appointments from the past
 *     12h to 36h that haven't had one sent yet.
 *
 * Each appointment tracks flags on itself so we don't double-send.
 */

const { readCollection, writeCollection, DEFAULT_TENANT } = require('../db');
const { sendSms, isEnabled: smsEnabled } = require('./sms');

const INTERVAL_MS = Number(process.env.SCHEDULER_INTERVAL_MS) || 10 * 60 * 1000; // 10 min
let timer = null;

function apptDateTime(appt) {
  return new Date(`${appt.date}T${appt.time}:00`);
}

function minutesBetween(a, b) {
  return (a.getTime() - b.getTime()) / 60000;
}

function buildReminderBody(appt, business, staffName, hoursOut) {
  const biz = (business && business.name) || 'Salon';
  const when = hoursOut >= 24 ? 'tomorrow' : `in ${Math.round(hoursOut)}h`;
  const timeStr = formatDisplayTime(appt.time);
  return `${biz}: Reminder — ${appt.serviceName} ${when} at ${timeStr}${staffName ? ` with ${staffName}` : ''}. Reply STOP to opt out.`;
}

function buildReviewRequestBody(appt, business, feedbackUrl) {
  const biz = (business && business.name) || 'Salon';
  return `${biz}: How was your ${appt.serviceName}? Let us know in 10 seconds: ${feedbackUrl}`;
}

function tenantPathPrefix(tenantId) {
  return tenantId && tenantId !== DEFAULT_TENANT ? `/t/${tenantId}` : '';
}

function formatDisplayTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

async function runTickForTenant(tenantId) {
  const appointments = await readCollection('appointments', tenantId) || [];
  const business = await readCollection('business', tenantId) || {};
  const staff = await readCollection('staff', tenantId) || [];
  const staffMap = Object.fromEntries(staff.map(s => [s.id, s.name]));

  const now = new Date();
  const publicUrlBase = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
  const publicUrl = publicUrlBase ? `${publicUrlBase}${tenantPathPrefix(tenantId)}` : '';
  let changed = false;

    for (const appt of appointments) {
      if (appt.status === 'cancelled') continue;
      appt.remindersSent = appt.remindersSent || {};

      const when = apptDateTime(appt);
      const minutesUntil = minutesBetween(when, now);

      // 24h reminder: send if 23h <= t <= 25h before appointment
      if (!appt.remindersSent.h24 && minutesUntil >= 23 * 60 && minutesUntil <= 25 * 60) {
        if (appt.customerPhone) {
          const body = buildReminderBody(appt, business, staffMap[appt.staffId], 24);
          const result = await sendSms(appt.customerPhone, body);
          if (result.sent) {
            appt.remindersSent.h24 = true;
            appt.remindersSent.h24At = new Date().toISOString();
            changed = true;
          }
        } else {
          // Mark as sent so we don't keep trying for customers with no phone
          appt.remindersSent.h24 = true;
          appt.remindersSent.h24Skipped = 'no_phone';
          changed = true;
        }
      }

      // 2h reminder: send if 1h <= t <= 3h before appointment
      if (!appt.remindersSent.h2 && minutesUntil >= 60 && minutesUntil <= 180) {
        if (appt.customerPhone) {
          const body = buildReminderBody(appt, business, staffMap[appt.staffId], 2);
          const result = await sendSms(appt.customerPhone, body);
          if (result.sent) {
            appt.remindersSent.h2 = true;
            appt.remindersSent.h2At = new Date().toISOString();
            changed = true;
          }
        } else {
          appt.remindersSent.h2 = true;
          appt.remindersSent.h2Skipped = 'no_phone';
          changed = true;
        }
      }

      // Review request: send if appointment completed 12h-36h ago (one-time)
      const minutesAgo = -minutesUntil;
      if (!appt.remindersSent.review && minutesAgo >= 12 * 60 && minutesAgo <= 36 * 60) {
        if (appt.customerPhone && publicUrl) {
          const feedbackUrl = `${publicUrl}/feedback/${appt.id}`;
          const body = buildReviewRequestBody(appt, business, feedbackUrl);
          const result = await sendSms(appt.customerPhone, body);
          if (result.sent) {
            appt.remindersSent.review = true;
            appt.remindersSent.reviewAt = new Date().toISOString();
            changed = true;
          }
        } else {
          appt.remindersSent.review = true;
          appt.remindersSent.reviewSkipped = appt.customerPhone ? 'no_public_url' : 'no_phone';
          changed = true;
        }
      }
    }

    if (changed) {
      await writeCollection('appointments', appointments, tenantId);
    }
}

async function runTick() {
  try {
    if (!smsEnabled()) return; // nothing to do if SMS is off

    // Build the list of tenants to process: the default tenant (always), plus
    // any tenants registered in the global `tenants` collection.
    const tenants = await readCollection('tenants') || [];
    const ids = [DEFAULT_TENANT, ...tenants.map(t => t.slug)];

    for (const id of ids) {
      try {
        await runTickForTenant(id);
      } catch (err) {
        console.error(`[scheduler] Tick failed for tenant ${id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[scheduler] Tick failed:', err.message);
  }
}

function start() {
  if (timer) return;
  console.log(`[scheduler] Starting reminder loop (interval=${INTERVAL_MS}ms, smsEnabled=${smsEnabled()})`);
  // Fire one tick shortly after startup, then on interval
  setTimeout(runTick, 15 * 1000);
  timer = setInterval(runTick, INTERVAL_MS);
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { start, stop, runTick };
