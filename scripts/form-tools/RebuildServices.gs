/**
 * ============================================================
 * MoonFlower AI — Rebuild Services Section
 * ============================================================
 *
 * Migrates the existing intake form's Services section (C) from
 * checkbox-per-category + adjustments-text-field to per-service
 * editable short-answer fields. Each field is pre-labeled with its
 * default in the help text so the salon owner sees what to override.
 *
 * After running:
 *   1. Open the form → 3-dot menu → "Get pre-filled link"
 *   2. For each service question, type the default (e.g., "yes $55 45min")
 *   3. Click "Get link" — copy the long URL
 *   4. Paste it into scripts/intake.config.mjs → INTAKE_FORM.publicUrl
 *      so visitors see all defaults prefilled.
 *
 * HOW TO RUN:
 *   1. Open your MoonFlower Salon Intake Generator Apps Script project
 *   2. Click + next to Files → Script → name it "RebuildServices"
 *   3. Paste this entire file
 *   4. Save, then click ▶ Run with "rebuildServicesSection" selected
 *   5. Check execution log for confirmation + list of new field titles
 *
 * SAFE: the migration only touches questions inside Section C. Your
 * form's other sections (Basics, Hours, Stylists, etc.) are untouched.
 * ============================================================
 */

// Default service catalog — same list as the original form but with
// structured prices and durations. Keep this in sync with
// scripts/lib/transform.mjs SERVICE_CATALOG.
const SERVICES_BY_CATEGORY = {
  'HAIR CUTS': [
    { name: "Women's Haircut & Style", price: 55, duration: 45 },
    { name: "Men's Haircut",           price: 35, duration: 30 },
    { name: "Children's Haircut (12 & under)", price: 25, duration: 30 },
    { name: "Bang Trim",   price: 15, duration: 15 },
    { name: "Beard Trim",  price: 20, duration: 20 },
    { name: "Buzz Cut",    price: 25, duration: 20 },
  ],
  'COLOR SERVICES': [
    { name: "Root Retouch",             price: 85,  duration: 90 },
    { name: "Full Color / All-Over",    price: 125, duration: 120 },
    { name: "Partial Highlights",       price: 95,  duration: 90 },
    { name: "Full Highlights",          price: 155, duration: 150 },
    { name: "Balayage",                 price: 185, duration: 180 },
    { name: "Ombre",                    price: 175, duration: 180 },
    { name: "Color Correction",         price: 200, duration: 210 },
    { name: "Toner / Gloss",            price: 45,  duration: 30 },
    { name: "Vivid / Fashion Color",    price: 225, duration: 240 },
    { name: "Color Consultation",       price: 0,   duration: 15 },
  ],
  'TREATMENTS': [
    { name: "Deep Conditioning Treatment", price: 35,  duration: 30 },
    { name: "Olaplex Treatment",           price: 45,  duration: 30 },
    { name: "Keratin Smoothing",           price: 225, duration: 180 },
    { name: "Brazilian Blowout",           price: 285, duration: 210 },
    { name: "Scalp Treatment",             price: 50,  duration: 30 },
    { name: "Hair Gloss",                  price: 55,  duration: 45 },
  ],
  'STYLING': [
    { name: "Blowout",                 price: 45,  duration: 45 },
    { name: "Special Occasion Style",  price: 75,  duration: 60 },
    { name: "Updo",                    price: 85,  duration: 60 },
    { name: "Bridal Trial",            price: 95,  duration: 90 },
    { name: "Bridal Day-Of",           price: 150, duration: 90 },
    { name: "Prom / Homecoming",       price: 75,  duration: 60 },
  ],
  'HAIR EXTENSIONS': [
    { name: "Extension Consultation",  price: 0,   duration: 30 },
    { name: "Extension Install",       price: 300, duration: 180 },
    { name: "Extension Maintenance",   price: 150, duration: 120 },
    { name: "Extension Removal",       price: 75,  duration: 60 },
  ],
};

const SERVICE_FIELD_SUFFIX = '— price & duration';

/**
 * Migrate the Services section on the existing form.
 */
function rebuildServicesSection() {
  const form = FormApp.openById('1TYYdgLpiFDvC6EB88glR9OVHrUSJFaNuXNh2ROD7Ce4');

  // 1. Remove any existing service-related questions we'll replace.
  //    We identify them by title prefix/suffix so pages (Section C) etc stay.
  const toDelete = [];
  form.getItems().forEach(item => {
    const title = item.getTitle();
    if (!title) return;
    const isCheckboxCategory = /^(HAIR CUTS|COLOR SERVICES|TREATMENTS|STYLING|HAIR EXTENSIONS) — check what you offer$/.test(title);
    const isAdjustmentsField = /price\/duration adjustments \(optional\)$/.test(title);
    const isServiceEntry = title.endsWith(SERVICE_FIELD_SUFFIX);
    const isServiceSectionHeader = /^(HAIR CUTS|COLOR SERVICES|TREATMENTS|STYLING|HAIR EXTENSIONS)$/.test(title);
    if (isCheckboxCategory || isAdjustmentsField || isServiceEntry || isServiceSectionHeader) {
      toDelete.push(item);
    }
  });
  toDelete.forEach(item => form.deleteItem(item));
  Logger.log(`Removed ${toDelete.length} existing service questions.`);

  // 2. Insert section header + one short-answer per service.
  //    Inserted at the position where the first-deleted item used to be
  //    — or at the end if none.
  const services = form.getItems();
  const introIndex = services.findIndex(i => /^C · Services/.test(i.getTitle()));
  let insertAt = introIndex >= 0 ? introIndex + 1 : services.length;

  const newFieldTitles = [];
  Object.entries(SERVICES_BY_CATEGORY).forEach(([category, list]) => {
    const header = form.addSectionHeaderItem()
      .setTitle(category)
      .setHelpText('For each service, edit the default if your pricing differs, or type "no" if you don\'t offer it. Leave blank to skip.');
    form.moveItem(header.getIndex(), insertAt++);

    list.forEach(svc => {
      const defaultStr = svc.price === 0
        ? `yes free ${svc.duration}min`
        : `yes $${svc.price} ${svc.duration}min`;
      const q = form.addTextItem()
        .setTitle(`${svc.name} ${SERVICE_FIELD_SUFFIX}`)
        .setHelpText(`Default: ${defaultStr}\nFormat: "yes $price Nmin" (e.g., "yes $65 45min") or "no".`);
      form.moveItem(q.getIndex(), insertAt++);
      newFieldTitles.push({ title: q.getTitle(), defaultValue: defaultStr });
    });
  });

  Logger.log('─────────────────────────────────────────────');
  Logger.log(`Added ${newFieldTitles.length} service questions.`);
  Logger.log('─────────────────────────────────────────────');
  Logger.log('New field titles (copy if needed):');
  newFieldTitles.forEach(f => Logger.log(`  ${f.title}  →  ${f.defaultValue}`));
  Logger.log('─────────────────────────────────────────────');
  Logger.log('NEXT STEPS:');
  Logger.log('1. Open the form Edit link and verify the Services section looks right.');
  Logger.log('2. In the form editor: 3-dot menu -> "Get pre-filled link"');
  Logger.log('3. For each service, type the default (shown above) into the field.');
  Logger.log('4. Click "Get link" at the bottom -> copy the long URL.');
  Logger.log('5. Paste that URL into scripts/intake.config.mjs as INTAKE_FORM.prefillUrl');
  Logger.log('6. The /intake page will use it so visitors see defaults pre-filled.');
}

/**
 * Replaces Section C's intro help text with copy that matches the new
 * per-category editable-list layout. Run once after switching formats.
 */
function updateServicesDescription() {
  const FORM_ID = '1TYYdgLpiFDvC6EB88glR9OVHrUSJFaNuXNh2ROD7Ce4';
  const form = FormApp.openById(FORM_ID);
  const items = form.getItems();
  const sectionC = items.find(function (i) { return /^C · Services/.test(i.getTitle()); });
  if (!sectionC) {
    Logger.log('Could not find "C · Services" section header.');
    return;
  }
  const newDescription =
    'For each category below, you will see a list of common services with default price and duration. ' +
    'Edit any price or time inline, delete lines for services you don\'t offer, and add your own services on new lines. ' +
    'Format for each line: "Service Name $price N minutes" (use "free" in place of $price for no-charge services).';
  sectionC.asPageBreakItem().setHelpText(newDescription);
  Logger.log('Updated Section C description.');
}
