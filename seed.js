// Run once to create DB table and load initial JSON data
// Usage: DATABASE_URL=... node seed.js
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const DATA_DIR = path.join(__dirname, 'data');

function readJSON(filename) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf-8'));
}

async function seed() {
  const client = await pool.connect();
  try {
    // Create table
    await client.query(`
      CREATE TABLE IF NOT EXISTS collections (
        name VARCHAR(50) PRIMARY KEY,
        data JSONB NOT NULL DEFAULT '[]',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('Table created (or already exists)');

    const collections = {
      business: readJSON('business.json'),
      services: readJSON('services.json'),
      staff: readJSON('staff.json'),
      reviews: readJSON('reviews.json'),
      appointments: [],
      users: []
    };

    // Try to load existing appointments/users if they exist
    try { collections.appointments = readJSON('appointments.json'); } catch {}
    try { collections.users = readJSON('users.json'); } catch {}

    for (const [name, data] of Object.entries(collections)) {
      await client.query(
        `INSERT INTO collections (name, data, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (name) DO UPDATE SET data = $2::jsonb, updated_at = NOW()`,
        [name, JSON.stringify(data)]
      );
      console.log(`Seeded: ${name}`);
    }

    console.log('Seed complete!');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
