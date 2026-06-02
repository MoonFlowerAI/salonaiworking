// Config for the MoonFlower AI salon intake workflow.
// Update here if you move the form to a different Google account or sheet.

export const INTAKE_FORM = {
  // Form shown embedded on /intake and shared with prospects
  publicUrl: 'https://forms.gle/EzRjjxEsEz7QWbMu8',
  viewformUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSdQeTzhVwgzuq3KtnmFk_mBlLWPxmjpAG4IsiC6Fj4_GJoDAA/viewform',
  editUrl: 'https://docs.google.com/forms/d/1TYYdgLpiFDvC6EB88glR9OVHrUSJFaNuXNh2ROD7Ce4/edit',
  formId: '1TYYdgLpiFDvC6EB88glR9OVHrUSJFaNuXNh2ROD7Ce4',
  // Prefilled URL with 5 editable category lists (Hair Cuts, Color,
  // Treatments, Styling, Extensions). Regenerate via rebuildServicesAsEditableLists()
  // in the MoonFlower Salon Intake Generator Apps Script project.
  prefillUrl: "https://docs.google.com/forms/d/e/1FAIpQLSdQeTzhVwgzuq3KtnmFk_mBlLWPxmjpAG4IsiC6Fj4_GJoDAA/viewform?usp=pp_url&entry.1986764300=Women's%20Haircut%20%26%20Style%20%2455%2045%20minutes%0AMen's%20Haircut%20%2435%2030%20minutes%0AChildren's%20Haircut%20(12%20%26%20under)%20%2425%2030%20minutes%0ABang%20Trim%20%2415%2015%20minutes%0ABeard%20Trim%20%2420%2020%20minutes%0ABuzz%20Cut%20%2425%2020%20minutes&entry.771858284=Root%20Retouch%20%2485%2090%20minutes%0AFull%20Color%20%2F%20All-Over%20%24125%20120%20minutes%0APartial%20Highlights%20%2495%2090%20minutes%0AFull%20Highlights%20%24155%20150%20minutes%0ABalayage%20%24185%20180%20minutes%0AOmbre%20%24175%20180%20minutes%0AColor%20Correction%20%24200%20210%20minutes%0AToner%20%2F%20Gloss%20%2445%2030%20minutes%0AVivid%20%2F%20Fashion%20Color%20%24225%20240%20minutes%0AColor%20Consultation%20free%2015%20minutes&entry.1279983176=Deep%20Conditioning%20Treatment%20%2435%2030%20minutes%0AOlaplex%20Treatment%20%2445%2030%20minutes%0AKeratin%20Smoothing%20%24225%20180%20minutes%0ABrazilian%20Blowout%20%24285%20210%20minutes%0AScalp%20Treatment%20%2450%2030%20minutes%0AHair%20Gloss%20%2455%2045%20minutes&entry.1410582284=Blowout%20%2445%2045%20minutes%0ASpecial%20Occasion%20Style%20%2475%2060%20minutes%0AUpdo%20%2485%2060%20minutes%0ABridal%20Trial%20%2495%2090%20minutes%0ABridal%20Day-Of%20%24150%2090%20minutes%0AProm%20%2F%20Homecoming%20%2475%2060%20minutes&entry.681417916=Extension%20Consultation%20free%2030%20minutes%0AExtension%20Install%20%24300%20180%20minutes%0AExtension%20Maintenance%20%24150%20120%20minutes%0AExtension%20Removal%20%2475%2060%20minutes",
};

export const INTAKE_SHEET = {
  // Linked response sheet (auto-detected via Forms API — do not hand-edit)
  url: 'https://docs.google.com/spreadsheets/d/1aczz5wd3QjDoS5eejYnwpiaZRxw6Q89j7E4jbvlRRtM/edit',
  id: '1aczz5wd3QjDoS5eejYnwpiaZRxw6Q89j7E4jbvlRRtM',
  // Tab name is auto-detected (first tab) if not matching — defaults below are
  // common Google-generated names.
  tab: 'Form Responses 1',
};

// Convenience: default creds path, overridable via --creds= flag.
export const DEFAULT_CREDS_PATH = './.credentials/sheets-sa.json';
