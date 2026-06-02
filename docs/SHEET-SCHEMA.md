# MoonFlower AI — Salon Intake Sheet Schema

This document describes how the Google Form / Sheet columns map to the
SalonAI data JSON files. When you change the intake form (in
`MoonflowerAI-Marketing/GoogleForm_Generator.gs`), update this doc and
the mapper at `scripts/intake-to-data.mjs`.

## How the sheet is structured

The intake form is a Google Form with a linked Sheet. Each row is one
client submission. Column headers match the question titles from the
form. The mapper reads a CSV export of the sheet (or a single row
pasted as CSV) and transforms it into the SalonAI data structure.

## Column → JSON mapping

### Section A · Basics → `business.json`

| Sheet column | JSON path | Notes |
|--------------|-----------|-------|
| `Salon Name` | `business.name` | |
| `Owner Name` | (stored for internal reference, not public) | |
| `Phone Number` | `business.phone` | |
| `Email` | `business.email` | |
| `Full Address` | `business.address` | |
| `Instagram Handle` | `business.social.instagram` | Strip leading `@` |
| `Facebook Page URL` | `business.social.facebook` | Extract username from URL |
| `Google Business Profile URL` | `business.googleReviewUrl` | |

### Section B · Hours → `business.hours`

Map each "Monday Hours" … "Sunday Hours" field to `business.hours.<day>`.
If a day is "Closed", store `"Closed"`. Otherwise store the range string
like `"9:00 AM - 7:00 PM"`.

### Section C · Services → `services.json`

Multiple checkbox questions per category (Hair Cuts, Color, Treatments,
Styling, Extensions). Each checked service becomes a row in
`services.json`. The mapper uses a **service catalog** (list of
known services with default duration + price) and produces entries
like:

```json
{
  "id": "haircut-women",
  "category": "Hair",
  "name": "Women's Haircut",
  "duration": 45,
  "price": 55,
  "description": "..."
}
```

Custom per-service price/duration overrides from the "adjustments"
text fields are parsed as `"servicename: $price, Nmin"` lines.

### Section D · Your Team → `staff.json`

For stylist N (1–6):
- `Stylist N — Name` → `staff[N-1].name`
- `Stylist N — Title` → `staff[N-1].title`
- `Stylist N — Specialties` → `staff[N-1].specialties` (array)
- `Stylist N — Years of experience` → `staff[N-1].yearsExperience`
- `Stylist N — Bio` → `staff[N-1].bio`
- `Stylist N — Headshot filename` → `staff[N-1].imageUrl` (prefixed with `/images/staff/`)

### Section E · Brand & Vibe → `business.theme`

- `Brand colors` (palette picker) → `business.theme.primary`, `.accent`, etc. (preset palettes)
- `Specific hex codes (if known)` → overrides palette if present
- `Tagline or one-line description` → `business.tagline`
- `Tone of voice for website copy` → stored in `business.tone` (used by chatbot prompt)

### Section F · Policies → `business.policies`

- `Cancellation notice required` → `business.policies.cancellationHours`
- `Late cancellation / no-show fee` → `business.policies.noShowFee`
- `Deposit required for bookings?` / `If deposit, how much?` → `business.policies.depositAmount`
- `Payment methods accepted` → `business.policies.paymentMethods` (array)
- `Walk-ins`, `Children welcome?`, `Pets` → `business.policies.*`

### Section G · Chatbot Personality → `business.chatbot`

- `Bot name preference` → `business.chatbot.name`
- `Bot personality` → `business.chatbot.tone`
- `When bot doesn't know, route customer to` → `business.chatbot.escalateTo`

### Section H · FAQ → `faq.json`

Selected stock FAQs + custom FAQs (1–5) → array of `{question, answer}`.

### Section I · Email & SMS → `business.automation`

Preferences for email/SMS reminder schedules. Informs runtime scheduler
config (not mapped to a data file — affects env vars at deploy).

## Unmapped fields

Some intake form fields are for MoonFlower's internal reference only
(e.g., photo folder link, 3 admired websites, existing website URL).
The mapper stores these in a `_meta` block for your records but they
don't appear on the public site.
