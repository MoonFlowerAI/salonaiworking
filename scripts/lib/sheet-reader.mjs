// Read a Google Sheet using a service-account JWT. No heavyweight SDK
// required — just jsonwebtoken (already a dependency) + native fetch.
//
// Given a sheet ID, tab name, and service-account JSON, returns
// { headers: string[], rows: string[][] }.

import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * Exchange a service-account JWT for an access token.
 */
async function getAccessToken(credsPath) {
  const creds = JSON.parse(readFileSync(credsPath, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: creds.client_email,
      scope: SHEETS_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    },
    creds.private_key,
    { algorithm: 'RS256' }
  );

  const params = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  return json.access_token;
}

/**
 * Read all values from a sheet tab.
 *
 *   readSheet({
 *     sheetId: '1ABC...',
 *     tab: 'Form Responses 1',   // or an A1 range like 'Form Responses 1!A1:CZ100'
 *     credsPath: './.credentials/sheets-sa.json',
 *   })
 *
 * Returns { headers, rows } where both are arrays of strings.
 */
export async function readSheet({ sheetId, tab, credsPath }) {
  const accessToken = await getAccessToken(credsPath);

  // If no tab specified, or the specified tab doesn't exist, fall back to the
  // first tab in the spreadsheet. This handles forms whose linked-sheet tab
  // was renamed or is just "Sheet1".
  if (!tab) {
    tab = await firstTabName(sheetId, accessToken);
  }

  const a1 = quoteA1(tab);
  const range = encodeURIComponent(a1);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?majorDimension=ROWS`;
  let res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

  // If the tab was wrong, list tabs and retry with the first one.
  if (res.status === 400) {
    const first = await firstTabName(sheetId, accessToken);
    if (first && first !== tab) {
      const retryUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(quoteA1(first))}?majorDimension=ROWS`;
      res = await fetch(retryUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    }
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets API failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  const values = json.values || [];
  if (values.length === 0) {
    return { headers: [], rows: [] };
  }
  const [headers, ...rows] = values;
  return { headers: headers.map(h => String(h).trim()), rows: rows.map(r => r.map(c => String(c ?? ''))) };
}

function quoteA1(tab) {
  if (/[\s!@#$%^&*()\[\]{};:'",<>?/\\|`~]/.test(tab)) {
    return `'${tab.replace(/'/g, "''")}'`;
  }
  return tab;
}

async function firstTabName(sheetId, accessToken) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) return null;
  const j = await r.json();
  return j.sheets?.[0]?.properties?.title || null;
}

/**
 * Turn a single row + headers into a { columnName: value } record.
 */
export function rowToRecord(headers, row) {
  const rec = {};
  headers.forEach((h, i) => {
    rec[h] = (row[i] ?? '').trim();
  });
  return rec;
}
