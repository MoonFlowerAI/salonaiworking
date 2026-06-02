const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5
});

const DEFAULT_TENANT = 'default';

// "global" collection names are not scoped per tenant — there's one across the whole deployment.
// Tenants list is global (so we can enumerate all tenants); everything else is tenant-scoped.
const GLOBAL_COLLECTIONS = new Set(['tenants']);

function scopedName(name, tenantId) {
  if (!name) throw new Error('collection name required');
  if (GLOBAL_COLLECTIONS.has(name)) return name;
  const t = tenantId || DEFAULT_TENANT;
  // Backward compat: if tenant is "default" and caller didn't pass one explicitly,
  // use the unscoped name so existing rows keep working. New tenants get prefixed.
  if (t === DEFAULT_TENANT) return name;
  return `t:${t}:${name}`;
}

async function readCollection(name, tenantId) {
  const key = scopedName(name, tenantId);
  const result = await pool.query('SELECT data FROM collections WHERE name = $1', [key]);
  return result.rows.length > 0 ? result.rows[0].data : null;
}

async function writeCollection(name, data, tenantId) {
  const key = scopedName(name, tenantId);
  await pool.query(
    `INSERT INTO collections (name, data, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (name) DO UPDATE SET data = $2::jsonb, updated_at = NOW()`,
    [key, JSON.stringify(data)]
  );
  return true;
}

async function deleteTenantCollections(tenantId) {
  if (!tenantId || tenantId === DEFAULT_TENANT) {
    throw new Error('Cannot delete default tenant data via this helper.');
  }
  const { rowCount } = await pool.query(
    `DELETE FROM collections WHERE name LIKE $1`,
    [`t:${tenantId}:%`]
  );
  return rowCount;
}

async function listTenantCollectionKeys(tenantId) {
  const prefix = tenantId && tenantId !== DEFAULT_TENANT ? `t:${tenantId}:%` : null;
  if (!prefix) {
    // Default tenant keys are anything not starting with t: and not in GLOBAL_COLLECTIONS
    const { rows } = await pool.query(`SELECT name FROM collections WHERE name NOT LIKE 't:%'`);
    return rows.map(r => r.name).filter(n => !GLOBAL_COLLECTIONS.has(n));
  }
  const { rows } = await pool.query(`SELECT name FROM collections WHERE name LIKE $1`, [prefix]);
  return rows.map(r => r.name);
}

module.exports = {
  pool,
  readCollection,
  writeCollection,
  deleteTenantCollections,
  listTenantCollectionKeys,
  DEFAULT_TENANT,
  GLOBAL_COLLECTIONS
};
