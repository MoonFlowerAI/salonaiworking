# Google Sheets API — One-Time Setup

Takes ~5 minutes. Lets the generator read the live intake sheet instead
of requiring a manual CSV download.

## 1. Create a Google Cloud project (if you don't have one)

1. Go to https://console.cloud.google.com/projectcreate
2. Name it anything (e.g. `moonflower-ai`)
3. Click **Create**

## 2. Enable the Sheets API

1. While in your project, go to **APIs & Services → Library**
2. Search **Google Sheets API** → click **Enable**

## 3. Create a service account

1. **APIs & Services → Credentials** → **+ Create Credentials** → **Service account**
2. Name: `salon-intake-reader`
3. Role: skip (no GCP roles needed — access is granted per-sheet)
4. Click **Done**

## 4. Download the key

1. On the Credentials page, click the service account you just made
2. **Keys** tab → **Add Key → Create new key** → **JSON** → **Create**
3. A `.json` file downloads. This is your private credential — **don't commit it**.
4. Create a folder `.credentials/` in the SalonAI repo root and save the file as:
   ```
   .credentials/sheets-sa.json
   ```
   (The `.credentials/` folder is already git-ignored.)

## 5. Share the intake sheet with the service account

1. Open the JSON file, find the `client_email` field — it looks like:
   ```
   salon-intake-reader@moonflower-ai.iam.gserviceaccount.com
   ```
2. Open **MoonFlower AI — Salon Intake Responses** in Google Sheets
3. Click **Share** → paste the `client_email` → give **Viewer** access → **Send**
4. Uncheck "Notify people" (service accounts don't have inboxes)

## 6. Find the sheet ID

From your sheet URL:
```
https://docs.google.com/spreadsheets/d/1AbC123XYZ.../edit#gid=0
                                      ^^^^^^^^^^^^^^^^
                                      this is the sheet ID
```

## 7. Test it

```bash
cd "C:/MF New/SalonAI"
node scripts/intake-to-data.mjs \
  --sheet=1AbC123XYZ... \
  --creds=.credentials/sheets-sa.json \
  --row=1 \
  --out=./out/test
```

If it prints `✓ business.json (Salon Name)` etc., auth is working.

## Common errors

- **403 "The caller does not have permission"** — you forgot to share
  the sheet with the service account's `client_email`. Re-share and wait
  a minute.
- **401 "invalid_grant"** — the service account JSON file is corrupted
  or the key has been revoked. Download a fresh key (step 4).
- **"Sheet returned no rows"** — the tab name doesn't match. Default is
  `Form Responses 1` (what Google Forms names it). Override with
  `--tab="Your Tab Name"`.
