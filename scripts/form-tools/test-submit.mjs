// Append a synthetic intake submission directly to the linked response
// sheet so we can test the full generator pipeline without having to
// fill the Google Form by hand.
//
// Usage:
//   node scripts/form-tools/test-submit.mjs
//
// Writes one new row using realistic test data. To process it end-to-end:
//   node scripts/intake-to-data.mjs --row=N --out=./out/test-salon
//   node scripts/new-salon-app.mjs --slug=test-salon --data=./out/test-salon --parent=..

import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';
import { INTAKE_SHEET } from '../intake.config.mjs';

const CREDS = './.credentials/sheets-sa.json';
const creds = JSON.parse(readFileSync(CREDS, 'utf8'));

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign({
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  }, creds.private_key, { algorithm: 'RS256' });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });
  if (!r.ok) throw new Error('Token exchange failed: ' + await r.text());
  return (await r.json()).access_token;
}

const token = await getAccessToken();

// 1. Fetch the sheet metadata + first row (headers) to build a row that
//    matches the column order.
const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${INTAKE_SHEET.id}?fields=sheets.properties.title`;
const metaRes = await fetch(metaUrl, { headers: { Authorization: 'Bearer ' + token } });
const meta = await metaRes.json();
const tabName = meta.sheets[0].properties.title;
console.log('Using tab:', tabName);

const hdrRange = encodeURIComponent(`'${tabName}'!1:1`);
const hdrRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${INTAKE_SHEET.id}/values/${hdrRange}`, {
  headers: { Authorization: 'Bearer ' + token },
});
const hdrJson = await hdrRes.json();
const headers = (hdrJson.values && hdrJson.values[0]) || [];
if (headers.length === 0) {
  console.error('Sheet has no header row — submit at least one real form response first.');
  process.exit(1);
}
console.log('Columns:', headers.length);

// 2. Build the synthetic test data. Maps column name -> value. Any header
//    not in this map gets an empty string.
const TEST_DATA = {
  'Timestamp': new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }),
  'Email address': 'test@moonflowerai.com',
  'Salon Name': 'Aurora Hair Studio',
  'Owner Name': 'Sarah Mitchell',
  'Phone Number': '(502) 555-9876',
  'Email': 'hello@aurorahairstudio.com',
  'Full Address': '789 Bardstown Road, Louisville, KY 40204',
  'Instagram Handle': '@aurorahair_lou',
  'Facebook Page URL': 'https://facebook.com/aurorahairstudio',

  // Hours — use the "same every day" preset
  'Your standard weekly schedule': '9 AM – 7 PM weekdays, Sat shorter, closed Sun',
  'Monday Hours':    '9:00 AM - 7:00 PM',
  'Tuesday Hours':   '9:00 AM - 7:00 PM',
  'Wednesday Hours': '9:00 AM - 7:00 PM',
  'Thursday Hours':  '9:00 AM - 7:00 PM',
  'Friday Hours':    '9:00 AM - 7:00 PM',
  'Saturday Hours':  '9:00 AM - 5:00 PM',
  'Sunday Hours':    'Closed',

  // Services — new editable-list format, one service per line
  'HAIR CUTS — services list':
    "Women's Haircut & Style $60 45 minutes\n" +
    "Men's Haircut $35 30 minutes\n" +
    "Children's Haircut (12 & under) $25 30 minutes\n" +
    "Blowout $45 45 minutes",
  'COLOR SERVICES — services list':
    "Root Retouch $90 90 minutes\n" +
    "Full Highlights $165 150 minutes\n" +
    "Balayage $200 180 minutes\n" +
    "Color Consultation free 15 minutes",
  'TREATMENTS — services list':
    "Deep Conditioning Treatment $40 30 minutes\n" +
    "Olaplex Treatment $50 30 minutes",
  'STYLING — services list':
    "Bridal Day-Of $175 90 minutes\n" +
    "Special Occasion Style $85 60 minutes",
  'HAIR EXTENSIONS — services list':
    "Extension Consultation free 30 minutes\n" +
    "Extension Install $325 180 minutes\n" +
    "Extension Maintenance $160 120 minutes",

  // Stylists (3 — stylists 4-6 left empty intentionally)
  'How many stylists / team members do you have?': '3',
  'Stylist 1 — Name': 'Sarah Mitchell',
  'Stylist 1 — Title': 'Owner / Master Stylist',
  'Stylist 1 — Specialties (check up to 5)': 'Balayage, Color correction, Bridal styling',
  'Stylist 1 — Years of experience': '12',
  'Stylist 1 — Bio (1–2 sentences)': 'Sarah founded Aurora after 12 years at top salons in Nashville and Louisville. She specializes in dimensional color and loves a good bridal updo.',
  'Stylist 1 — Headshot filename': 'sarah.jpg',

  'Stylist 2 — Name': 'Jessica Park',
  'Stylist 2 — Title': 'Senior Stylist',
  'Stylist 2 — Specialties (check up to 5)': 'Highlights, Cutting, Extensions',
  'Stylist 2 — Years of experience': '7',
  'Stylist 2 — Bio (1–2 sentences)': 'Jessica is our go-to for natural-looking highlights and hand-tied extensions. Vidal Sassoon trained.',
  'Stylist 2 — Headshot filename': 'jessica.jpg',

  'Stylist 3 — Name': 'Megan Reyes',
  'Stylist 3 — Title': 'Stylist',
  'Stylist 3 — Specialties (check up to 5)': 'Men\'s Cuts, Kids Cuts, Fashion Colors',
  'Stylist 3 — Years of experience': '4',
  'Stylist 3 — Bio (1–2 sentences)': 'Megan is our resident color artist. She\'s the one to see for vivid fashion shades and sharp men\'s cuts.',
  'Stylist 3 — Headshot filename': 'megan.jpg',

  // Brand
  'Brand colors — pick the closest feel': 'Rose gold + cream',
  'Tagline or one-line description (optional)': 'Dimensional color and flawless cuts in Louisville\'s Highlands neighborhood.',
  'Website vibe': 'Luxurious & elegant',
  'Tone of voice for website copy': 'Warm & friendly',

  // Policies
  'Cancellation notice required': '24 hours',
  'Late cancellation / no-show fee': '50% of service price',
  'Deposit required for bookings?': 'Yes — for color services only',
  'Children welcome?': 'Yes — 12 and under discount available',
  'Pets': 'Service animals only',
  'Payment methods accepted (check all)': 'Cash, Credit card, Debit card, Venmo, Apple Pay, Tap to pay',
  'Walk-ins': 'Yes — specific days only',

  // Chatbot
  'Bot name preference': 'Luna',
  'Bot personality': 'Warm & friendly',
  "When bot doesn't know, route customer to": 'Text owner directly',

  // FAQ — new editable-list format
  'Website FAQs — editable list':
    "Q: What's your cancellation policy?\n" +
    "A: 24 hours notice required. Late cancellations or no-shows incur a 50% fee.\n\n" +
    "Q: Do you accept walk-ins?\n" +
    "A: Walk-ins welcome on Tuesdays and Thursdays based on availability.\n\n" +
    "Q: Do you offer free consultations?\n" +
    "A: Yes — free 15 min consultations for color services and extensions.",
};

// 3. Build a row in exact column order
const row = headers.map(h => TEST_DATA[h.trim()] ?? '');

// 4. Append the row via Sheets API values.append
const appendRange = encodeURIComponent(`'${tabName}'!A1`);
const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${INTAKE_SHEET.id}/values/${appendRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
const appendRes = await fetch(appendUrl, {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ values: [row] }),
});
if (!appendRes.ok) {
  console.error('Append failed:', await appendRes.text());
  process.exit(1);
}
const result = await appendRes.json();
console.log('✓ Row appended. Updated range:', result.updates?.updatedRange);
console.log('');
console.log('Test salon: Aurora Hair Studio (Sarah Mitchell)');
console.log('Fields populated:', Object.keys(TEST_DATA).length);
console.log('');
console.log('Next: run the generator on this row');
