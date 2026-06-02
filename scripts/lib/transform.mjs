// Shared transform logic: turns a single intake "record" (column name →
// answer) into the SalonAI data JSON structure. Consumed by both the
// CSV reader and the Google Sheets reader.

const COLOR_PALETTES = {
  'Rose gold + cream': { primary: '#b76e79', primaryDark: '#8e4a54', dark: '#1a1a2e', cream: '#faf3e0', gold: '#d4a574' },
  'Emerald + gold':    { primary: '#0b7d5e', primaryDark: '#064d3a', dark: '#1a2e1a', cream: '#faf3e0', gold: '#d4a574' },
  'Midnight + silver': { primary: '#1a1a2e', primaryDark: '#0a0a1a', dark: '#000', cream: '#e8e8f0', gold: '#c0c0c8' },
  'Blush + black':     { primary: '#f3b5b5', primaryDark: '#c77a7a', dark: '#1a1a1a', cream: '#fff0f0', gold: '#d4a574' },
  'Sage + terracotta': { primary: '#8aa88a', primaryDark: '#5b7a5b', dark: '#2a2a2a', cream: '#faf3e0', gold: '#d4a574' },
  'Deep purple + gold':{ primary: '#5B2C87', primaryDark: '#3a1a5a', dark: '#1A1A2E', cream: '#E8DFF5', gold: '#D4A017' },
};

// Canonical service catalog — order and labels must match the intake
// form's per-service short-answer questions (see scripts/form-tools/
// RebuildServices.gs). When a service field is present in the intake
// row, its default price/duration are overridden by the parsed value.
const SERVICE_CATALOG = {
  // Hair Cuts
  "Women's Haircut & Style":         { id: 'haircut-women',    category: 'Hair', duration: 45, price: 55 },
  "Men's Haircut":                   { id: 'haircut-men',      category: 'Hair', duration: 30, price: 35 },
  "Children's Haircut (12 & under)": { id: 'haircut-kids',     category: 'Hair', duration: 30, price: 25 },
  'Bang Trim':                       { id: 'bang-trim',        category: 'Hair', duration: 15, price: 15 },
  'Beard Trim':                      { id: 'beard-trim',       category: 'Hair', duration: 20, price: 20 },
  'Buzz Cut':                        { id: 'buzz-cut',         category: 'Hair', duration: 20, price: 25 },
  // Color
  'Root Retouch':                    { id: 'color-root',       category: 'Hair', duration: 90,  price: 85 },
  'Full Color / All-Over':           { id: 'color-full',       category: 'Hair', duration: 120, price: 125 },
  'Partial Highlights':              { id: 'color-partial',    category: 'Hair', duration: 90,  price: 95 },
  'Full Highlights':                 { id: 'color-highlights', category: 'Hair', duration: 150, price: 155 },
  'Balayage':                        { id: 'color-balayage',   category: 'Hair', duration: 180, price: 185 },
  'Ombre':                           { id: 'color-ombre',      category: 'Hair', duration: 180, price: 175 },
  'Color Correction':                { id: 'color-correction', category: 'Hair', duration: 210, price: 200 },
  'Toner / Gloss':                   { id: 'color-toner',      category: 'Hair', duration: 30,  price: 45 },
  'Vivid / Fashion Color':           { id: 'color-vivid',      category: 'Hair', duration: 240, price: 225 },
  'Color Consultation':              { id: 'color-consult',    category: 'Hair', duration: 15,  price: 0 },
  // Treatments
  'Deep Conditioning Treatment':     { id: 'treatment-deep-cond', category: 'Hair', duration: 30,  price: 35 },
  'Olaplex Treatment':               { id: 'treatment-olaplex',   category: 'Hair', duration: 30,  price: 45 },
  'Keratin Smoothing':               { id: 'treatment-keratin',   category: 'Hair', duration: 180, price: 225 },
  'Brazilian Blowout':               { id: 'treatment-brazilian', category: 'Hair', duration: 210, price: 285 },
  'Scalp Treatment':                 { id: 'treatment-scalp',     category: 'Hair', duration: 30,  price: 50 },
  'Hair Gloss':                      { id: 'treatment-gloss',     category: 'Hair', duration: 45,  price: 55 },
  // Styling
  'Blowout':                         { id: 'styling-blowout',  category: 'Hair', duration: 45, price: 45 },
  'Special Occasion Style':          { id: 'styling-occasion', category: 'Hair', duration: 60, price: 75 },
  'Updo':                            { id: 'styling-updo',     category: 'Hair', duration: 60, price: 85 },
  'Bridal Trial':                    { id: 'styling-bridal-trial', category: 'Hair', duration: 90, price: 95 },
  'Bridal Day-Of':                   { id: 'styling-bridal-day',   category: 'Hair', duration: 90, price: 150 },
  'Prom / Homecoming':               { id: 'styling-prom',     category: 'Hair', duration: 60, price: 75 },
  // Extensions
  'Extension Consultation':          { id: 'extensions-consult', category: 'Hair', duration: 30,  price: 0 },
  'Extension Install':               { id: 'extensions-install', category: 'Hair', duration: 180, price: 300 },
  'Extension Maintenance':           { id: 'extensions-maint',   category: 'Hair', duration: 120, price: 150 },
  'Extension Removal':               { id: 'extensions-removal', category: 'Hair', duration: 60,  price: 75 },
};

// Parse a per-service intake answer like "yes $55 45min" / "$65 45" / "no" / ""
// Returns null if the service is not offered, or { price, duration } if it is.
function parseServiceEntry(value) {
  if (!value) return null;
  const trimmed = String(value).trim().toLowerCase();
  if (trimmed === 'no' || trimmed === '' || /^not?\b/.test(trimmed) || /don'?t/.test(trimmed)) return null;
  const nums = value.match(/\d+(?:\.\d+)?/g);
  const hasOfferSignal = /yes|\$|\d/i.test(value);
  if (!hasOfferSignal) return null;
  return {
    price: nums && nums[0] !== undefined ? parseFloat(nums[0]) : null,
    duration: nums && nums[1] !== undefined ? parseInt(nums[1], 10) : null,
  };
}

// Parse a category paragraph field where each line is:
//   "Name $price N minutes"   or   "Name free N minutes"
// Returns array of { name, price, duration }.
function parseCategoryListField(text) {
  if (!text) return [];
  const out = [];
  text.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    // Name + price + duration. "min", "mins", "minute", "minutes" all accepted.
    const m = trimmed.match(/^(.+?)\s+(\$\d+(?:\.\d+)?|free)\s+(\d+)\s*(?:min(?:ute)?s?)?\.?$/i);
    if (!m) return;
    const name = m[1].trim();
    const priceStr = m[2].toLowerCase();
    const price = priceStr === 'free' ? 0 : parseFloat(priceStr.replace('$', ''));
    const duration = parseInt(m[3], 10);
    out.push({ name, price, duration });
  });
  return out;
}

function slugify(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'svc';
}

function pick(row, ...columnNames) {
  for (const col of columnNames) {
    if (row[col] != null && row[col] !== '') return row[col];
  }
  return '';
}

function splitCheckboxes(val) {
  if (!val) return [];
  return val.split(/,\s*/).map(s => s.trim()).filter(Boolean);
}

function stripAt(handle) {
  if (!handle) return '';
  return handle.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '');
}

function parseFbUsername(url) {
  if (!url) return '';
  const m = url.match(/facebook\.com\/([^/?#]+)/i);
  return m ? m[1] : url;
}

export function buildBusiness(row) {
  const palette = pick(row, 'Brand colors — pick the closest feel', 'Brand colors');
  const hexes = pick(row, 'Specific hex codes (if known)');
  const theme = { ...(COLOR_PALETTES[palette] || COLOR_PALETTES['Rose gold + cream']) };
  if (hexes) {
    hexes.split(/[,;\n]/).forEach(pair => {
      const [k, v] = pair.split(':').map(s => s && s.trim());
      if (k && v && /^#?[0-9a-f]{3,8}$/i.test(v.replace('#', ''))) {
        const hex = v.startsWith('#') ? v : '#' + v;
        if (/^primary$/i.test(k)) theme.primary = hex;
        else if (/^accent|gold$/i.test(k)) theme.gold = hex;
        else if (/^dark$/i.test(k)) theme.dark = hex;
      }
    });
  }
  return {
    name: pick(row, 'Salon Name'),
    tagline: pick(row, 'Tagline or one-line description (optional)', 'Tagline') || 'Where Beauty Meets Excellence',
    phone: pick(row, 'Phone Number'),
    email: pick(row, 'Email'),
    address: pick(row, 'Full Address', 'Address'),
    hours: {
      'mon-fri': buildWeekdayHours(row),
      'sat':     pick(row, 'Saturday Hours') || 'Closed',
      'sun':     pick(row, 'Sunday Hours') || 'Closed',
    },
    social: {
      instagram: pick(row, 'Instagram Handle') ? '@' + stripAt(pick(row, 'Instagram Handle')) : '',
      facebook: parseFbUsername(pick(row, 'Facebook Page URL')),
    },
    industry: 'salon',
    terminology: {
      provider: 'Stylist', providers: 'Stylists',
      service: 'Service',  services: 'Services',
      appointment: 'Appointment', appointments: 'Appointments',
      customer: 'Customer',
    },
    categories: ['Hair', 'Nails', 'Skin', 'Makeup'],
    theme,
    serviceLocation: 'in-shop',
    googleReviewUrl: pick(row, 'Google Business Profile URL (if you have one)') || '',
    policies: {
      cancellationHours: parseInt(pick(row, 'Cancellation notice required')) || 24,
      noShowFee: pick(row, 'Late cancellation / no-show fee') || '',
      depositRequired: /yes/i.test(pick(row, 'Deposit required for bookings?')),
      depositAmount: pick(row, 'If deposit, how much?') || '',
      paymentMethods: splitCheckboxes(pick(row, 'Payment methods accepted (check all)', 'Payment methods accepted')),
      walkIns: pick(row, 'Walk-ins') || '',
      children: pick(row, 'Children welcome?') || '',
      pets: pick(row, 'Pets') || '',
    },
    chatbot: {
      name: pick(row, 'Bot name preference') || 'Luna',
      tone: pick(row, 'Bot personality') || 'Warm and professional',
      escalateTo: pick(row, "When bot doesn't know, route customer to") || 'owner',
    },
    _meta: {
      ownerName: pick(row, 'Owner Name'),
      existingWebsite: pick(row, 'Existing Website URL (if any)'),
      tiktok: pick(row, 'TikTok Handle (optional)'),
      photoFolder: pick(row, 'Link to your photo folder'),
    },
  };
}

function buildWeekdayHours(row) {
  const mon = pick(row, 'Monday Hours');
  const tue = pick(row, 'Tuesday Hours');
  const wed = pick(row, 'Wednesday Hours');
  const thu = pick(row, 'Thursday Hours');
  const fri = pick(row, 'Friday Hours');
  if (mon && mon === tue && tue === wed && wed === thu && thu === fri) return mon;
  return mon || '9:00 AM - 7:00 PM';
}

export function buildServices(row) {
  const out = [];

  // NEWEST format: one paragraph field per category with "Name $price N minutes"
  // on each line. Matches the form layout produced by
  // rebuildServicesAsEditableLists() in RebuildServices.gs.
  const LIST_FIELD_SUFFIX = ' — services list';
  const listFields = Object.keys(row).filter(k => k.endsWith(LIST_FIELD_SUFFIX));
  if (listFields.length > 0) {
    for (const field of listFields) {
      const entries = parseCategoryListField(row[field]);
      for (const entry of entries) {
        const seed = SERVICE_CATALOG[entry.name];
        out.push({
          id: seed ? seed.id : slugify(entry.name),
          name: entry.name,
          category: seed ? seed.category : 'Hair',
          duration: entry.duration,
          price: entry.price,
          description: '', addOns: [],
        });
      }
    }
  }

  // If no list-field data found, try the per-service format, then legacy.
  if (out.length === 0) {
    // Per-service short-answer fields ("<Service Name> — price & duration")
    for (const [label, seed] of Object.entries(SERVICE_CATALOG)) {
      const raw = pick(row, `${label} — price & duration`, `${label} — price and duration`);
      if (raw) {
        const parsed = parseServiceEntry(raw);
        if (parsed) {
          out.push({
            id: seed.id, name: label, category: seed.category,
            duration: parsed.duration ?? seed.duration,
            price: parsed.price ?? seed.price,
            description: '', addOns: [],
          });
        }
        continue;
      }

      // LEGACY format: checkbox categories + adjustments text field.
      const legacyChecked = [
        splitCheckboxes(pick(row, 'HAIR CUTS — check what you offer')),
        splitCheckboxes(pick(row, 'COLOR SERVICES — check what you offer')),
        splitCheckboxes(pick(row, 'TREATMENTS — check what you offer')),
        splitCheckboxes(pick(row, 'STYLING — check what you offer')),
        splitCheckboxes(pick(row, 'HAIR EXTENSIONS — check what you offer')),
      ].flat();
      if (legacyChecked.includes(label)) {
        out.push({
          id: seed.id, name: label, category: seed.category,
          duration: seed.duration, price: seed.price,
          description: '', addOns: [],
        });
      }
    }
  }

  // Free-text "Additional services not listed above" — still supported
  const extra = pick(row, 'Additional services not listed above');
  if (extra) {
    const lines = extra.split(/\n/).map(s => s.trim()).filter(Boolean);
    lines.forEach((line, i) => {
      // Accepts "Name | Nmin | $price" or "Name - $price - Nmin"
      const pipeMatch = line.match(/^(.+?)\s*\|\s*(\d+)\s*(?:min|hr)?\s*\|\s*\$?(\d+(?:\.\d+)?)/i);
      const dashMatch = line.match(/^(.+?)\s*[-–]\s*\$?(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+)\s*min)?/i);
      if (pipeMatch) {
        out.push({
          id: `extra-${i + 1}`, name: pipeMatch[1].trim(), category: 'Hair',
          duration: parseInt(pipeMatch[2], 10), price: parseFloat(pipeMatch[3]),
          description: '', addOns: [],
        });
      } else if (dashMatch) {
        out.push({
          id: `extra-${i + 1}`, name: dashMatch[1].trim(), category: 'Hair',
          duration: parseInt(dashMatch[3], 10) || 60, price: parseFloat(dashMatch[2]),
          description: '', addOns: [],
        });
      }
    });
  }
  return out;
}

export function buildStaff(row) {
  const out = [];
  for (let n = 1; n <= 6; n++) {
    const name = pick(row, `Stylist ${n} — Name`);
    if (!name) continue;
    out.push({
      id: `stylist-${n}`, name,
      title: pick(row, `Stylist ${n} — Title`) || 'Stylist',
      specialties: splitCheckboxes(pick(row, `Stylist ${n} — Specialties (check up to 5)`, `Stylist ${n} — Specialties`)),
      yearsExperience: parseInt(pick(row, `Stylist ${n} — Years of experience`)) || null,
      bio: pick(row, `Stylist ${n} — Bio (1–2 sentences)`, `Stylist ${n} — Bio`) || '',
      imageUrl: pick(row, `Stylist ${n} — Headshot filename`)
        ? '/images/staff/' + pick(row, `Stylist ${n} — Headshot filename`)
        : '',
    });
  }
  return out;
}

export function buildFaq(row) {
  const out = [];

  // NEW format: single "Website FAQs — editable list" paragraph with blocks:
  //   Q: question
  //   A: answer
  //   (blank line)
  //   Q: ...
  const listText = pick(row, 'Website FAQs — editable list', 'FAQ list');
  if (listText) {
    const blocks = String(listText).split(/\n\s*\n/);
    for (const block of blocks) {
      const lines = block.split(/\n/).map(l => l.trim()).filter(Boolean);
      let question = '', answer = '';
      for (const line of lines) {
        const qm = line.match(/^q\s*[:\-]\s*(.+)$/i);
        const am = line.match(/^a\s*[:\-]\s*(.+)$/i);
        if (qm) question = qm[1].trim();
        else if (am) answer = am[1].trim();
        else if (!answer) question = (question + ' ' + line).trim();
        else answer = (answer + ' ' + line).trim();
      }
      if (question) out.push({ question, answer });
    }
  }

  // LEGACY format fallback: stock checkboxes + Custom FAQ 1-5
  if (out.length === 0) {
    const picks = splitCheckboxes(pick(row, 'FAQs to include on your website (check all that apply)'));
    picks.forEach(q => out.push({ question: q, answer: '' }));
    for (let n = 1; n <= 5; n++) {
      const q = pick(row, `Custom FAQ ${n} — Question`);
      const a = pick(row, `Custom FAQ ${n} — Answer`);
      if (q && a) out.push({ question: q, answer: a });
    }
  }

  return out;
}
