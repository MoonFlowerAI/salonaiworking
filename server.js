require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const { readCollection, pool } = require('./db');
const { globalLimiter, apiLimiter, authLimiter, botBlocker } = require('./lib/security');

const app = express();
const PORT = process.env.PORT || 3006;

// Auto-migrate intakes table on startup (Postgres mode only)
if (pool) {
  pool.query(`
    CREATE TABLE IF NOT EXISTS intakes (
      id            SERIAL PRIMARY KEY,
      submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ip            TEXT,
      salon_name    TEXT,
      owner_name    TEXT,
      owner_email   TEXT,
      phone         TEXT,
      status        TEXT NOT NULL DEFAULT 'new',
      notes         TEXT,
      data          JSONB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS intakes_submitted_at_idx ON intakes (submitted_at DESC);
    CREATE INDEX IF NOT EXISTS intakes_salon_name_idx   ON intakes (salon_name);
    CREATE INDEX IF NOT EXISTS intakes_status_idx       ON intakes (status);
  `).then(() => console.log('intakes table ready')).catch(err => console.error('intakes migration error:', err));

  // Auto-seed demo data if collections table is empty
  (async () => {
    try {
      const fs = require('fs');
      const dataDir = path.join(__dirname, 'data');

      // Create collections table if it doesn't exist
      await pool.query(`
        CREATE TABLE IF NOT EXISTS collections (
          name        VARCHAR(100) PRIMARY KEY,
          data        JSONB NOT NULL DEFAULT '[]',
          updated_at  TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Check if demo data is already seeded
      const { rows } = await pool.query(`SELECT COUNT(*) FROM collections WHERE name = 'business'`);
      if (parseInt(rows[0].count) > 0) {
        console.log('collections table already seeded — skipping auto-seed');
        return;
      }

      // Seed from data/ files
      const seedFiles = { business: 'business.json', services: 'services.json', staff: 'staff.json', reviews: 'reviews.json' };
      for (const [name, file] of Object.entries(seedFiles)) {
        const filePath = path.join(dataDir, file);
        if (!fs.existsSync(filePath)) continue;
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        await pool.query(
          `INSERT INTO collections (name, data, updated_at) VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (name) DO UPDATE SET data = $2::jsonb, updated_at = NOW()`,
          [name, JSON.stringify(data)]
        );
        console.log(`auto-seeded: ${name}`);
      }
      // Seed empty appointments/users
      for (const name of ['appointments', 'users']) {
        await pool.query(
          `INSERT INTO collections (name, data, updated_at) VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (name) DO NOTHING`,
          [name, '[]']
        );
      }
      console.log('auto-seed complete');
    } catch (err) {
      console.error('auto-seed error:', err.message);
    }
  })();
}

// Security middleware
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://moonflowerai.com,https://www.moonflowerai.com')
  .split(',').map(o => o.trim());
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (server-to-server, mobile apps) and whitelisted origins
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('CORS: origin not allowed'));
  },
  credentials: true,
}));

app.use(botBlocker);       // block known scraper UAs
app.use(globalLimiter);    // 200 req/min per IP globally
app.use('/api', apiLimiter);           // 60 req/min on all API routes
app.use('/api/auth', authLimiter);     // 10 attempts/15min on auth

app.use(express.json());

// Tenant resolution: must run BEFORE any route that reads tenant-scoped data.
// This attaches req.tenantId and strips /t/<slug> prefixes so downstream routers
// match paths as if multi-tenant didn't exist.
const { tenantMiddleware } = require('./lib/tenant');
app.use(tenantMiddleware());

// Dynamic manifest from DB
app.get('/manifest.json', async (req, res) => {
  try {
    const biz = await readCollection('business', req.tenantId) || {};
    const initial = (biz.name || 'S')[0];
    res.json({
      name: biz.name || 'Salon & Spa',
      short_name: (biz.name || 'Salon').replace(/\s*Salon\s*&\s*Spa/i, '') + ' Salon',
      description: `${biz.tagline || ''}. Book appointments, explore services, and chat with our smart assistant.`,
      start_url: '/',
      display: 'standalone',
      background_color: '#1a1a2e',
      theme_color: '#b76e79',
      orientation: 'portrait-primary',
      icons: [
        { src: `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'><rect width='192' height='192' rx='32' fill='%231a1a2e'/><text x='96' y='120' font-size='100' text-anchor='middle' fill='%23b76e79'>${initial}</text></svg>`, sizes: '192x192', type: 'image/svg+xml' },
        { src: `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'><rect width='512' height='512' rx='64' fill='%231a1a2e'/><text x='256' y='320' font-size='280' text-anchor='middle' fill='%23b76e79'>${initial}</text></svg>`, sizes: '512x512', type: 'image/svg+xml' }
      ]
    });
  } catch (err) {
    console.error('Manifest error:', err);
    res.status(500).json({ error: 'Failed to load manifest' });
  }
});

// Static files — served at both root and /salonai/ so video/asset links work
// regardless of whether the request comes through a path-prefixed proxy.
app.use(express.static(path.join(__dirname, 'public')));
app.use('/salonai', express.static(path.join(__dirname, 'public')));

// Intake landing page — inject Turnstile site key if configured
app.get(['/intake', '/salonai/intake'], async (_req, res) => {
  const siteKey = process.env.TURNSTILE_SITE_KEY || '';
  if (!siteKey) return res.sendFile(path.join(__dirname, 'public', 'intake.html'));
  const { readFile } = require('node:fs/promises');
  const html = await readFile(path.join(__dirname, 'public', 'intake.html'), 'utf8');
  const injected = html.replace('<head>', `<head>\n  <meta name="turnstile-site-key" content="${siteKey}">`);
  res.type('html').send(injected);
});

// Intake admin — internal only
app.get('/admin/intakes', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-intakes.html'));
});

// Routes (stripe route applies express.raw() internally on its webhook endpoint)
app.use('/api/stripe', require('./routes/stripe'));
app.use('/api/superadmin', require('./routes/superadmin'));
app.use(['/api', '/salonai/api'], require('./routes/api'));
app.use(['/api/auth', '/salonai/api/auth'], require('./routes/auth'));
app.use(['/api/admin', '/salonai/api/admin'], require('./routes/admin'));
app.use(['/api/chat', '/salonai/api/chat'], require('./routes/chat'));
app.use('/feedback', require('./routes/feedback'));
app.use('/cancel', require('./routes/cancel'));
app.use('/api/voice', require('./routes/voice'));
app.use('/api/posts', require('./routes/posts'));

// MoonFlower AI marketing/pricing endpoints. Only enabled on the demo site
if (process.env.MOONFLOWER_MODE === 'demo') {
  app.use('/api/moonflower', require('./routes/moonflower'));
  console.log('[moonflower] marketing pricing endpoints enabled');
}

// SPA fallback
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the reminder + review-request scheduler
const scheduler = require('./lib/scheduler');
scheduler.start();

app.listen(PORT, async () => {
  const biz = await readCollection('business').catch(() => ({})); // default tenant only
  console.log(`${(biz || {}).name || 'Salon'} server running on http://localhost:${PORT}`);
});
