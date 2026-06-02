// Transform one row of the MoonFlower AI salon intake into SalonAI
// data JSON files. Accepts input in two modes:
//
//   (CSV mode)  — read from a downloaded .csv export of the sheet
//     node scripts/intake-to-data.mjs --csv=./row.csv --out=./out [--row=1]
//
//   (Sheet mode) — read directly from the live Google Sheet
//     node scripts/intake-to-data.mjs \
//       --sheet=<sheet-id> \
//       --tab="Form Responses 1" \
//       --creds=./.credentials/sheets-sa.json \
//       --row=3 \
//       --out=./out
//
// --row is 1-indexed over DATA rows (excluding the header).
// The sheet ID is the part of the URL between /d/ and /edit.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { buildBusiness, buildServices, buildStaff, buildFaq } from './lib/transform.mjs';
import { readSheet, rowToRecord } from './lib/sheet-reader.mjs';
import { INTAKE_SHEET, DEFAULT_CREDS_PATH } from './intake.config.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

// If neither --csv nor --sheet specified, default to the configured
// intake sheet. Row is still required so you explicitly pick which
// client to process.
if (!args.csv && !args.sheet && !args.row) {
  console.error('Usage (defaulting to configured intake sheet):');
  console.error('  node scripts/intake-to-data.mjs --row=N --out=<dir>');
  console.error('  node scripts/intake-to-data.mjs --csv=<path> --out=<dir> [--row=N]');
  console.error('  node scripts/intake-to-data.mjs --sheet=<id> --creds=<path> --out=<dir> [--row=N]');
  process.exit(1);
}
if (!args.csv && !args.sheet) {
  // Default to configured intake sheet
  args.sheet = INTAKE_SHEET.id;
  args.tab = args.tab || INTAKE_SHEET.tab;
  args.creds = args.creds || DEFAULT_CREDS_PATH;
}

const outDir = args.out || './out';
const rowIdx = parseInt(args.row || '1', 10);

// ────────────────────────────────────────────────────────────────
// CSV parser (quoted fields + escaped quotes)
// ────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else { field += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else { field += c; }
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// ────────────────────────────────────────────────────────────────
// Load the record
// ────────────────────────────────────────────────────────────────
let record;

if (args.sheet) {
  console.log(`Reading sheet ${args.sheet} (row ${rowIdx})...`);
  if (!args.creds) {
    console.error('Sheet mode requires --creds=<path to service-account JSON>');
    process.exit(1);
  }
  const { headers, rows } = await readSheet({
    sheetId: args.sheet,
    tab: args.tab || 'Form Responses 1',
    credsPath: args.creds,
  });
  if (!rows[rowIdx - 1]) {
    console.error(`Row ${rowIdx} not found. Sheet has ${rows.length} data rows.`);
    process.exit(1);
  }
  record = rowToRecord(headers, rows[rowIdx - 1]);
} else {
  console.log(`Reading CSV ${args.csv} (row ${rowIdx})...`);
  const csvText = readFileSync(args.csv, 'utf8');
  const rows = parseCSV(csvText);
  if (rows.length < 2) {
    console.error('CSV must have at least a header row + 1 data row.');
    process.exit(1);
  }
  const headers = rows[0];
  const dataRow = rows[rowIdx];
  if (!dataRow) {
    console.error(`Row ${rowIdx} not found (file has ${rows.length - 1} data rows).`);
    process.exit(1);
  }
  record = Object.fromEntries(headers.map((h, i) => [h.trim(), (dataRow[i] || '').trim()]));
}

// ────────────────────────────────────────────────────────────────
// Transform + write
// ────────────────────────────────────────────────────────────────
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const business = buildBusiness(record);
const services = buildServices(record);
const staff    = buildStaff(record);
const faq      = buildFaq(record);

writeFileSync(join(outDir, 'business.json'), JSON.stringify(business, null, 2));
writeFileSync(join(outDir, 'services.json'), JSON.stringify(services, null, 2));
writeFileSync(join(outDir, 'staff.json'),    JSON.stringify(staff, null, 2));
writeFileSync(join(outDir, 'faq.json'),      JSON.stringify(faq, null, 2));

console.log(`✓ business.json   (${business.name || '[no name]'})`);
console.log(`✓ services.json   (${services.length} services)`);
console.log(`✓ staff.json      (${staff.length} stylists)`);
console.log(`✓ faq.json        (${faq.length} FAQs)`);
console.log(`\nWrote to: ${outDir}`);
