/**
 * Security middleware: rate limiting, bot blocking, Cloudflare Turnstile verification.
 *
 * Turnstile (optional but recommended):
 *   Sign up free at https://dash.cloudflare.com/?to=/:account/turnstile
 *   Add to .env:  TURNSTILE_SITE_KEY=...   TURNSTILE_SECRET_KEY=...
 *   When both are set, intake form requires a valid Turnstile token.
 *   When not set, falls back to honeypot-only.
 */

const rateLimit = require('express-rate-limit');

// --------------- Rate limiters ---------------

/** Global limiter: 200 req/min per IP — generous for real users, stops bulk scrapers */
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
  skip: (req) => req.path.startsWith('/css/') || req.path.startsWith('/js/') || req.path.startsWith('/images/'),
});

/** API limiter: 60 req/min per IP */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many API requests.' },
});

/** Auth limiter: 10 attempts per 15 min per IP — brute force protection */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

/** Intake limiter: 3 submissions per 10 min per IP */
const intakeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions. Please try again later.' },
});

/** Appointment lookup: 5 lookups per 10 min per IP — stops email enumeration */
const lookupLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests.' },
});

// --------------- Bot / scraper UA blocking ---------------

const BOT_UA_PATTERNS = [
  /python-urllib/i, /python-requests/i, /scrapy/i, /curl\//i, /wget\//i,
  /go-http-client/i, /java\//i, /libwww-perl/i, /lwp-trivial/i,
  /mechanize/i, /phantomjs/i, /htmlparser/i, /headlesschrome/i,
  /selenium/i, /puppeteer/i, /playwright/i, /cypress/i,
  /zgrab/i, /masscan/i, /nikto/i, /sqlmap/i, /nmap/i,
  /ahrefsbot/i, /semrushbot/i, /dotbot/i, /mj12bot/i, /blexbot/i,
];

function botBlocker(req, res, next) {
  const ua = req.headers['user-agent'] || '';
  if (!ua) {
    // No user-agent at all — almost always a bot or raw script
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (BOT_UA_PATTERNS.some(p => p.test(ua))) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

// --------------- Cloudflare Turnstile verification ---------------

async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true, skipped: true }; // not configured, allow through

  if (!token) return { ok: false, error: 'Missing security token' };

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token, remoteip: ip }),
    });
    const data = await res.json();
    if (data.success) return { ok: true };
    console.warn('[turnstile] verification failed:', data['error-codes']);
    return { ok: false, error: 'Security check failed. Please refresh and try again.' };
  } catch (err) {
    console.error('[turnstile] fetch error:', err.message);
    return { ok: true, skipped: true }; // network error — don't block legitimate users
  }
}

module.exports = { globalLimiter, apiLimiter, authLimiter, intakeLimiter, lookupLimiter, botBlocker, verifyTurnstile };
