// Generator: stamp out a new client salon app from the SalonAI template.
//
// Usage:
//   node scripts/new-salon-app.mjs \
//     --slug=blue-diamond \
//     --data=./out/blue-diamond \          (dir containing business.json etc.)
//     --parent=..                          (where to create the new app folder)
//
// After it finishes:
//   cd ../<slug>
//   # follow DEPLOY.md for Railway + GitHub + DNS steps

import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync, rmSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const templateRoot = resolve(__dirname, '..');

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

if (!args.slug || !args.data) {
  console.error('Usage: node scripts/new-salon-app.mjs --slug=<slug> --data=<dir> [--parent=..]');
  process.exit(1);
}

const slug = args.slug;
const parent = resolve(args.parent || '..');
const targetDir = join(parent, slug);
const dataDir = resolve(args.data);

if (existsSync(targetDir)) {
  console.error(`Target directory already exists: ${targetDir}`);
  console.error('Refusing to overwrite. Move or delete it first.');
  process.exit(1);
}

console.log(`Generating new salon app at: ${targetDir}`);
console.log(`Source template:              ${templateRoot}`);
console.log(`Client data:                  ${dataDir}`);

// ────────────────────────────────────────────────────────────────
// 1. Copy template to new directory, excluding junk
// ────────────────────────────────────────────────────────────────
const EXCLUDE = new Set([
  'node_modules', '.git', '.env', 'dev-otp.txt',
  'MoonFlower-Salon-Starter', 'MoonflowerAI-Marketing',
  'test-results', 'test-data', 'out',
  // Template-only docs/scripts the generated app doesn't need
  'CLAUDE.md',
]);

function copyExcluding(src, dest) {
  cpSync(src, dest, {
    recursive: true,
    filter: (source) => {
      const rel = source.substring(src.length + 1).split(/[\\/]/)[0];
      if (!rel) return true;
      return !EXCLUDE.has(rel);
    },
  });
}

mkdirSync(targetDir, { recursive: true });
copyExcluding(templateRoot, targetDir);
console.log('✓ Copied template files');

// ────────────────────────────────────────────────────────────────
// 2. Overwrite data/*.json with client data
// ────────────────────────────────────────────────────────────────
const dataFiles = ['business.json', 'services.json', 'staff.json', 'faq.json'];
for (const f of dataFiles) {
  const src = join(dataDir, f);
  if (existsSync(src)) {
    cpSync(src, join(targetDir, 'data', f));
    console.log(`✓ Wrote data/${f}`);
  } else {
    console.log(`⚠ Skipped data/${f} (not found in ${dataDir})`);
  }
}

// Preserve reviews.json as-is (clients can edit post-launch via admin)
// ────────────────────────────────────────────────────────────────
// 3. Substitute tokens in HTML (title, meta description)
// ────────────────────────────────────────────────────────────────
const business = JSON.parse(readFileSync(join(targetDir, 'data', 'business.json'), 'utf8'));
const indexPath = join(targetDir, 'public', 'index.html');
if (existsSync(indexPath)) {
  let html = readFileSync(indexPath, 'utf8');

  // 1. Update title and meta description with client's brand so SEO crawlers
  //    see the salon instead of the template's "Salon & Spa" fallback.
  html = html.replace(/<title[^>]*>[^<]*<\/title>/, `<title id="pageTitle">${business.name}</title>`);
  html = html.replace(
    /<meta\s+name="description"[^>]*>/,
    `<meta name="description" id="metaDesc" content="${business.name} - ${business.tagline || 'Book appointments for hair, nails, skin, and makeup services.'}">`
  );

  // 2. Strip all content between <!-- DEMO_ONLY:START --> and <!-- DEMO_ONLY:END -->.
  //    These are MoonFlower AI marketing blocks (intake CTA card, Get Yours nav
  //    link, bottom-of-page promo, footer byline) that belong on the demo site
  //    but not on an actual client's public salon site.
  const demoBlockRe = /\n?\s*<!--\s*DEMO_ONLY:START\s*-->[\s\S]*?<!--\s*DEMO_ONLY:END\s*-->\s*\n?/g;
  const beforeCount = (html.match(demoBlockRe) || []).length;
  html = html.replace(demoBlockRe, '\n');
  if (beforeCount > 0) {
    console.log(`✓ Stripped ${beforeCount} DEMO_ONLY blocks from index.html`);
  }

  writeFileSync(indexPath, html);
  console.log('✓ Updated public/index.html meta tags');
}

// ────────────────────────────────────────────────────────────────
// 4. Update package.json name
// ────────────────────────────────────────────────────────────────
const pkgPath = join(targetDir, 'package.json');
if (existsSync(pkgPath)) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.name = slug;
  pkg.description = `${business.name} - powered by MoonFlower AI`;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  console.log('✓ Updated package.json');
}

// ────────────────────────────────────────────────────────────────
// 5. Write .env.example for the new app
// ────────────────────────────────────────────────────────────────
const envExample = `# Required
JWT_SECRET=<generate a random 64-byte string>
DATABASE_URL=<Railway Postgres public URL>

# AI (chat widget)
ANTHROPIC_API_KEY=

# Email (Brevo)
BREVO_API_KEY=
BREVO_SMTP_USER=
SENDER_EMAIL=hello@${(business.email || '').split('@')[1] || 'moonflowerai.com'}

# Payments (Stripe) — optional
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# SMS (Twilio) — optional
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM=

# Public URL (where users reach this app)
PUBLIC_URL=https://${slug}.moonflowerai.com
`;
writeFileSync(join(targetDir, '.env.example'), envExample);
console.log('✓ Wrote .env.example');

// ────────────────────────────────────────────────────────────────
// 6. Write DEPLOY.md with step-by-step instructions
// ────────────────────────────────────────────────────────────────
const deployMd = `# Deploy Guide — ${business.name}

Generated: ${new Date().toISOString().slice(0, 10)}
Template source: SalonAI (upstream remote already configured)

## 1. GitHub repo

\`\`\`bash
cd "${targetDir.replace(/\\/g, '/')}"
git add -A
git commit -m "Initial commit (generated from SalonAI template)"
gh repo create ${slug} --public --source=. --push
\`\`\`

## 2. Create Railway project + Postgres

1. Go to https://railway.app/new → "Deploy from GitHub repo" → pick \`${slug}\`
2. In the new project, click **+ New** → **Database** → **Add PostgreSQL**
3. On the **${slug}** service → Variables tab → add reference to \`POSTGRES.DATABASE_URL\` (rename to \`DATABASE_URL\`)

## 3. Set the rest of the env vars

On the **${slug}** service Variables tab, add (see \`.env.example\`):

- \`JWT_SECRET\` — run \`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"\` and paste
- \`ANTHROPIC_API_KEY\` — from your MoonFlower AI account (reuse across clients)
- \`BREVO_API_KEY\` + \`BREVO_SMTP_USER\` — from your Brevo account
- \`SENDER_EMAIL\` — verified Brevo sender for ${business.name}
- (Optional) Stripe and Twilio keys if payments/SMS are enabled for this client

## 4. Seed the database

After first deploy succeeds but before customers arrive:

\`\`\`bash
railway link   # pick this project
railway run node seed.js
\`\`\`

This creates the \`collections\` table and seeds business, services, staff, reviews from \`data/*.json\`.

## 5. Custom domain (optional)

On **${slug}** service → Settings → Networking → **+ Custom Domain**
- Enter the client's domain (e.g., \`${(business.email || '').split('@')[1] || 'example.com'}\`)
- Add the CNAME Railway shows to the client's DNS (Cloudflare recommended)

## 6. Smoke test

- Visit the Railway \`.up.railway.app\` URL → should load ${business.name}
- Try a booking end-to-end with a test email
- Admin login: use the owner's email, request OTP, check Brevo logs

## 7. Keeping in sync with the template

This repo has \`https://github.com/raokgoli/salonai\` as \`upstream\` remote. To pull future template fixes:

\`\`\`bash
git fetch upstream
git merge upstream/master
# resolve any conflicts in data/*.json (keep this client's data)
git push
\`\`\`
`;
writeFileSync(join(targetDir, 'DEPLOY.md'), deployMd);
console.log('✓ Wrote DEPLOY.md');

// ────────────────────────────────────────────────────────────────
// 7. Init git + add upstream remote
// ────────────────────────────────────────────────────────────────
try {
  execSync('git init -q', { cwd: targetDir });
  execSync('git remote add upstream https://github.com/raokgoli/salonai.git', { cwd: targetDir });
  console.log('✓ git init + added upstream remote');
} catch (err) {
  console.log(`⚠ Git init skipped: ${err.message}`);
}

// ────────────────────────────────────────────────────────────────
// 8. (Optional) Create GitHub repo via `gh` CLI and push
// ────────────────────────────────────────────────────────────────
if (args.github) {
  const visibility = args.private ? '--private' : '--public';
  try {
    execSync('gh --version', { cwd: targetDir, stdio: 'ignore' });
  } catch {
    console.log('⚠ gh CLI not found on PATH — skipping GitHub repo creation.');
    console.log('  Install: https://cli.github.com');
  }
  try {
    execSync('git add -A', { cwd: targetDir, stdio: 'inherit' });
    execSync(`git commit -q -m "Initial commit (generated from SalonAI template)"`, { cwd: targetDir });
    execSync(`gh repo create ${slug} ${visibility} --source=. --push`, { cwd: targetDir, stdio: 'inherit' });
    console.log(`✓ Pushed to github.com (${visibility.slice(2)})`);
  } catch (err) {
    console.log(`⚠ GitHub push failed: ${err.message}`);
    console.log('  You can push manually from the generated directory.');
  }
}

// ────────────────────────────────────────────────────────────────
// Summary
// ────────────────────────────────────────────────────────────────
console.log('');
console.log('═══════════════════════════════════════════════════════');
console.log(`✓ New salon app generated: ${business.name}`);
console.log(`  Location: ${targetDir}`);
console.log('');
console.log('Next steps:');
console.log(`  cd "${targetDir}"`);
console.log('  Open DEPLOY.md and follow steps 1-6');
console.log('═══════════════════════════════════════════════════════');
