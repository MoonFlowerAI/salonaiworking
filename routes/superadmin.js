/**
 * Super-admin tenant lifecycle endpoints.
 *
 * Gated by the SUPERADMIN_KEY env var: the client must send it in the
 * `X-Superadmin-Key` header. There is no UI for this — it's a back-channel
 * for the platform operator (you) to provision new customer tenants.
 *
 * Endpoints:
 *   GET    /api/superadmin/tenants             — list all tenants
 *   POST   /api/superadmin/tenants             — create a new tenant
 *                                                 body: { slug, name, ownerEmail? }
 *   DELETE /api/superadmin/tenants/:slug       — delete a tenant AND all its data
 *   POST   /api/superadmin/tenants/:slug/seed  — seed empty collections for a fresh tenant
 */

const express = require('express');
const router = express.Router();
const {
  readCollection,
  writeCollection,
  deleteTenantCollections
} = require('../db');
const { validSlug } = require('../lib/tenant');

function superAdminGate(req, res, next) {
  const expected = process.env.SUPERADMIN_KEY;
  if (!expected) {
    return res.status(503).json({ error: 'Superadmin API not configured (SUPERADMIN_KEY env missing).' });
  }
  const provided = req.headers['x-superadmin-key'];
  if (!provided || provided !== expected) {
    return res.status(401).json({ error: 'Invalid superadmin key' });
  }
  next();
}

router.use(superAdminGate);

// GET /api/superadmin/tenants
router.get('/tenants', async (req, res) => {
  try {
    const tenants = await readCollection('tenants') || [];
    res.json(tenants);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load tenants' });
  }
});

// POST /api/superadmin/tenants
router.post('/tenants', async (req, res) => {
  try {
    const { slug, name, ownerEmail } = req.body || {};
    if (!slug || !name) return res.status(400).json({ error: 'slug and name are required' });
    if (!validSlug(slug)) {
      return res.status(400).json({ error: 'Invalid slug. Use lowercase letters, digits, hyphens (2-32 chars, starting alnum).' });
    }

    const tenants = await readCollection('tenants') || [];
    if (tenants.find(t => t.slug === slug)) {
      return res.status(409).json({ error: 'Tenant with that slug already exists' });
    }

    const tenant = {
      slug,
      name,
      ownerEmail: ownerEmail || '',
      createdAt: new Date().toISOString()
    };
    tenants.push(tenant);
    await writeCollection('tenants', tenants);

    // Seed minimal empty collections so new tenant has something to work with
    await writeCollection('business', { name, terminology: {}, theme: {}, categories: [] }, slug);
    await writeCollection('services', [], slug);
    await writeCollection('staff', [], slug);
    await writeCollection('appointments', [], slug);
    await writeCollection('reviews', [], slug);
    await writeCollection('gallery', [], slug);
    await writeCollection('users', [], slug);

    res.status(201).json({ message: 'Tenant created', tenant });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create tenant' });
  }
});

// POST /api/superadmin/tenants/:slug/seed
// Re-seeds empty collections for a tenant (won't overwrite existing data).
router.post('/tenants/:slug/seed', async (req, res) => {
  try {
    const slug = req.params.slug;
    const tenants = await readCollection('tenants') || [];
    if (!tenants.find(t => t.slug === slug)) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    const seeds = {
      services: [], staff: [], appointments: [], reviews: [], gallery: [], users: []
    };
    for (const [name, value] of Object.entries(seeds)) {
      const existing = await readCollection(name, slug);
      if (existing == null) {
        await writeCollection(name, value, slug);
      }
    }
    res.json({ message: 'Seeded missing collections', slug });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to seed tenant' });
  }
});

// DELETE /api/superadmin/tenants/:slug
router.delete('/tenants/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    const tenants = await readCollection('tenants') || [];
    const idx = tenants.findIndex(t => t.slug === slug);
    if (idx === -1) return res.status(404).json({ error: 'Tenant not found' });

    const [removed] = tenants.splice(idx, 1);
    await writeCollection('tenants', tenants);

    // Wipe all of the tenant's collection rows
    const deletedCount = await deleteTenantCollections(slug);

    res.json({ message: 'Tenant deleted', tenant: removed, deletedRows: deletedCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete tenant' });
  }
});

// ─── Intake management ───────────────────────────────────────────────────────

const { pool } = require('../db');

// GET /api/superadmin/intakes?status=new&q=blue+diamond&page=1
router.get('/intakes', async (req, res) => {
  try {
    const { status, q, page = 1 } = req.query;
    const limit = 50;
    const offset = (parseInt(page) - 1) * limit;
    const params = [];
    const wheres = [];

    if (status) { params.push(status); wheres.push(`status = $${params.length}`); }
    if (q) { params.push(`%${q}%`); wheres.push(`(salon_name ILIKE $${params.length} OR owner_email ILIKE $${params.length} OR owner_name ILIKE $${params.length})`); }

    const where = wheres.length ? 'WHERE ' + wheres.join(' AND ') : '';
    params.push(limit, offset);

    const [rows, count] = await Promise.all([
      pool.query(`SELECT id, submitted_at, salon_name, owner_name, owner_email, phone, status, notes FROM intakes ${where} ORDER BY submitted_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params),
      pool.query(`SELECT COUNT(*) FROM intakes ${where}`, params.slice(0, -2)),
    ]);

    res.json({ intakes: rows.rows, total: parseInt(count.rows[0].count), page: parseInt(page), limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load intakes' });
  }
});

// GET /api/superadmin/intakes/:id
router.get('/intakes/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM intakes WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load intake' });
  }
});

// PATCH /api/superadmin/intakes/:id
router.patch('/intakes/:id', async (req, res) => {
  try {
    const { status, notes } = req.body;
    const allowed = ['new', 'in-progress', 'launched', 'on-hold', 'declined'];
    if (status && !allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const sets = [];
    const params = [];
    if (status) { params.push(status); sets.push(`status = $${params.length}`); }
    if (notes !== undefined) { params.push(notes); sets.push(`notes = $${params.length}`); }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

    params.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE intakes SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id, status, notes`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update intake' });
  }
});

module.exports = router;
