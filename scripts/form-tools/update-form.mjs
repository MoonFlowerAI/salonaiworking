// CLI for editing the MoonFlower AI intake Google Form via the Forms API.
//
// Prerequisites: .credentials/sheets-sa.json (service account with Forms API
// enabled; form shared with the service account email as Editor).
//
// Commands:
//   node scripts/form-tools/update-form.mjs inspect
//     Dumps form title + section headers + item counts so we can see what's there.
//
//   node scripts/form-tools/update-form.mjs update-section-c
//     Rewrites the "C · Services" section description to match the current
//     editable-list layout (replaces stale checkbox-era copy).

import { createClient } from './forms-api.mjs';

const FORM_ID = '1TYYdgLpiFDvC6EB88glR9OVHrUSJFaNuXNh2ROD7Ce4';
const CREDS = process.env.FORMS_SA_CREDS || './.credentials/sheets-sa.json';

const cmd = process.argv[2];

if (!cmd) {
  console.error('Usage: node scripts/form-tools/update-form.mjs <command>');
  console.error('Commands: inspect, update-section-c');
  process.exit(1);
}

const client = await createClient(CREDS);

if (cmd === 'inspect') {
  const form = await client.getForm(FORM_ID);
  console.log('Title:', form.info?.title);
  console.log('Items:', form.items?.length);
  console.log('');
  for (const item of form.items || []) {
    const kind = Object.keys(item).find(k => /Item$/.test(k)) || 'unknown';
    const tag = kind === 'pageBreakItem' ? '§ SECTION' : kind === 'textItem' ? 'HEADER' : '·';
    console.log(`  [${item.itemId}] ${tag}  ${item.title || ''}`);
  }
  process.exit(0);
}

if (cmd === 'update-section-c') {
  const form = await client.getForm(FORM_ID);
  const sectionC = (form.items || []).find(
    i => (i.title || '').startsWith('C · Services') && i.pageBreakItem
  );
  if (!sectionC) {
    console.error('Could not find "C · Services" page break item.');
    process.exit(1);
  }

  const newDescription =
    'For each category below, you will see a list of common services with default price and duration. ' +
    'Edit any price or time inline, delete lines for services you don\'t offer, and add your own services on new lines. ' +
    'Format for each line: "Service Name $price N minutes" (use "free" in place of $price for no-charge services).';

  await client.batchUpdate(FORM_ID, [
    {
      updateItem: {
        item: {
          itemId: sectionC.itemId,
          title: sectionC.title,
          description: newDescription,
          pageBreakItem: {},
        },
        location: { index: form.items.indexOf(sectionC) },
        updateMask: 'description',
      },
    },
  ]);

  console.log('✓ Updated "C · Services" description.');
  process.exit(0);
}

if (cmd === 'mark-extra-stylists-optional') {
  const form = await client.getForm(FORM_ID);
  const notice =
    'Only fill this section if your salon has 5 or more stylists. ' +
    'If you have 4 or fewer stylists, skip — leave every field blank and click Next.';

  const targets = (form.items || []).filter(i =>
    /^Stylist (5|6) of 6$/.test(i.title || '') && i.pageBreakItem
  );
  if (targets.length === 0) {
    console.error('No "Stylist 5 of 6" or "Stylist 6 of 6" page breaks found.');
    process.exit(1);
  }

  const requests = targets.map(t => ({
    updateItem: {
      item: {
        itemId: t.itemId,
        title: t.title,
        description: notice,
        pageBreakItem: {},
      },
      location: { index: form.items.indexOf(t) },
      updateMask: 'description',
    },
  }));

  await client.batchUpdate(FORM_ID, requests);
  console.log(`✓ Updated ${targets.length} stylist section(s) with "optional" notice.`);
  targets.forEach(t => console.log('  - ' + t.title));
  process.exit(0);
}

if (cmd === 'rebuild-faq') {
  const form = await client.getForm(FORM_ID);

  // Default FAQ list — prefills the new paragraph field. Salon owners edit
  // answers to match their policies, delete questions that don't apply, and
  // add their own at the end.
  const FAQ_DEFAULTS = [
    { q: "What's your cancellation policy?",
      a: "We ask for 24 hours notice for cancellations. Late cancellations or no-shows may incur a 50% fee." },
    { q: "Do you accept walk-ins?",
      a: "Walk-ins are welcome based on availability, but appointments are strongly recommended." },
    { q: "Do you offer free consultations?",
      a: "Yes — free consultations for color services, extensions, and bridal bookings. Just ask when you book." },
    { q: "What payment methods do you accept?",
      a: "Cash, all major credit and debit cards, Venmo, and Apple Pay." },
    { q: "Do you take deposits?",
      a: "A deposit is required for color services, extensions, and bridal packages to secure your appointment." },
    { q: "How early should I arrive for my appointment?",
      a: "Please arrive 5–10 minutes before your appointment so we can start on time." },
    { q: "What should I do if I need to reschedule?",
      a: "Call or text us at least 24 hours in advance and we will find a new time that works for you." },
    { q: "Are children allowed in the salon?",
      a: "Children are welcome during their own appointments. For safety reasons, we ask that kids not accompany other appointments." },
    { q: "Do you have parking?",
      a: "Yes, free parking is available for clients in our lot." },
    { q: "Do you sell retail products?",
      a: "Yes, we carry professional hair care and styling products. Ask your stylist for recommendations." },
  ];

  // Remove the existing Section-H FAQ items (stock checkbox + 5 custom FAQ pairs
  // + any previously-added editable list), then insert the new single paragraph.
  const itemsToDelete = (form.items || []).filter(item => {
    const t = item.title || '';
    return /^FAQs to include on your website/.test(t)
      || /^Custom FAQ \d/.test(t)
      || /^Add your own FAQs/.test(t)
      || /^More than 5 custom FAQs/.test(t)
      || /^Any FAQ answers you want changed/.test(t)
      || t === 'FAQ list'
      || t === 'Website FAQs — editable list';
  });

  const deleteRequests = itemsToDelete
    .sort((a, b) => form.items.indexOf(b) - form.items.indexOf(a))
    .map(item => ({ deleteItem: { location: { index: form.items.indexOf(item) } } }));

  // Locate Section H so we insert just after it
  const sectionH = (form.items || []).find(i => /^H · FAQ/.test(i.title || '') && i.pageBreakItem);
  if (!sectionH) {
    console.error('Could not find "H · FAQ Library" page break.');
    process.exit(1);
  }

  const defaultText = FAQ_DEFAULTS.map(f => `Q: ${f.q}\nA: ${f.a}`).join('\n\n');

  // Delete first, then insert. Forms API processes requests in order, but deleting
  // shifts indices — so we delete from the bottom up (done via sort above).
  const insertRequest = {
    createItem: {
      item: {
        title: 'Website FAQs — editable list',
        description:
          'Here are common salon FAQs pre-answered with sensible defaults. Edit any answer to match your policies, ' +
          'delete any question that doesn\'t apply to your salon, and add your own FAQs on new lines below. ' +
          'Format: "Q: question" on one line, "A: answer" on the next, blank line between FAQs.',
        questionItem: {
          question: {
            required: false,
            textQuestion: { paragraph: true },
          },
        },
      },
      location: { index: form.items.indexOf(sectionH) + 1 },
    },
  };

  await client.batchUpdate(FORM_ID, [...deleteRequests, insertRequest]);

  // Re-fetch to get the new item's ID
  const updatedForm = await client.getForm(FORM_ID);
  const newItem = (updatedForm.items || []).find(i => i.title === 'Website FAQs — editable list');

  console.log(`✓ Removed ${itemsToDelete.length} old FAQ items.`);
  console.log(`✓ Inserted "Website FAQs — editable list" paragraph field.`);
  console.log('');
  console.log('New FAQ field itemId:', newItem?.itemId);
  console.log('Prefill entry ID (first questionId):', newItem?.questionItem?.question?.questionId);
  console.log('');
  console.log('Paste the entry ID into scripts/intake.config.mjs if you want the new field');
  console.log('included in the prefill URL.');
  console.log('');
  console.log('Default prefill text:');
  console.log('─────────────────────────────────────────────');
  console.log(defaultText);
  console.log('─────────────────────────────────────────────');
  process.exit(0);
}

console.error(`Unknown command: ${cmd}`);
process.exit(1);
