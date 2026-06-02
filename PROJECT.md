# MoonFlower AI — Master Project Memory

**Purpose of this file:** one place to see every piece of the MoonFlower AI
ecosystem — what exists, where it lives, how pieces connect, what's pending.
Update this file whenever something significant changes so nothing gets lost.

**Last updated:** 2026-04-25
**Owner:** Raja "Eswar" Goli (raokgoli@gmail.com)
**Company:** MoonFlower AI LLC · Louisville, KY (registered · EIN issued)

---

## 1 · Product hierarchy

```
MoonFlower AI LLC  (company / master brand)
│
├── moonflowerai.com                    ← master site (Next.js "Demo1")
│
└── SalonAI  (first business entity)
    │
    ├── Landing page                    ← "Salonainew" — pricing + Demo dropdown
    │   moonflowerai.com/salonai → 307 → salonainew-production.up.railway.app/#basic
    │
    ├── Claire's Salon & Spa demo       ← "SalonAI" — actual live salon site
    │   salonai-production.up.railway.app
    │   supports ?demo=basic | ?demo=pro | ?demo=premium
    │
    └── Automation pipeline             ← plans/ folder inside SalonAI repo
        (scaffolder, content-pack, auto-provisioner, etc.)
```

---

## 2 · Projects (folders → repos → Railway services → live URLs)

### 🟣 Demo1 — master brand site (moonflowerai.com)
- **Folder:** `C:\MF New\Demo1`
- **Tech:** Next.js + Tailwind
- **GitHub:** `github.com/raokgoli/moonflower-ai-demo1`
- **Railway:** deployed to a service under the `moonflower-ai` project
- **Live URL:** `https://moonflowerai.com` / `https://www.moonflowerai.com`
- **Key file:** `next.config.js` — defines rewrites + redirects
  - `/salonai` → 307 redirect to `https://salonainew-production.up.railway.app/#basic`
  - `/salonai/:path*` → rewrite to `salonai-production` (backward compat)
  - `/css/*`, `/js/*`, `/images/*`, `/api/*` → rewrite to `salonai-production`

### 🟢 Salonainew — SalonAI landing page
- **Folder:** `C:\MF New\SalonAInew`
- **Tech:** Express/Node (static HTML/CSS served from `public/`)
- **GitHub:** `github.com/raokgoli/Salonainew` (private)
- **Railway:** `salonainew` service (auto-deploys on git push)
- **Live URL:** `https://salonainew-production.up.railway.app`
- **Accessed via:** `moonflowerai.com/salonai` (via the Demo1 redirect)
- **Nav:** `Demo ▾` (dropdown) + `Social Media Promos ▾` (dropdown) + `Login`
  - Demo → Basic   → opens `salonai-production.../?demo=basic` in new tab
  - Demo → Pro     → opens `salonai-production.../?demo=pro` in new tab
  - Demo → Premium → opens `salonai-production.../?demo=premium` in new tab
  - Social Media Promos → Spring → `/videos/promo/reset-week-promo-final.mp4`
  - Social Media Promos → Summer → `/videos/promo/summer-glow/final.mp4`
  - Social Media Promos → Fall → `/videos/promo/fall-refresh/final.mp4`
  - Social Media Promos → Winter → `/videos/promo/holiday-glam/final.mp4`
- **Hero:** clean — text only, no buttons, no embedded video. Hero photo overlay reduced to ~25% opacity so the salon image is visible
- **Main section:** 3 pricing cards (see §4 for current prices)
- **Signup CTAs:** all point to `forms.gle/EzRjjxEsEz7QWbMu8?tier=<basic|pro|premium>`

### 🔵 SalonAI — Claire's Salon & Spa demo
- **Folder:** `C:\MF New\SalonAI`
- **Tech:** Express/Node + Postgres (file-based fallback when no DATABASE_URL)
- **GitHub:** `github.com/raokgoli/salonai` (public)
- **Railway:** `salonai` service in `endearing-abundance` project
- **Live URL:** `https://salonai-production.up.railway.app`
- **Database:** Postgres on Railway — seeded with Claire's data
- **Env vars on Railway:** `GROQ_API_KEY`, `GROQ_MODEL`, `MOONFLOWER_MODE=demo`, `MOONFLOWER_URL_PREFIX=/salonai`, `REPLICATE_API_TOKEN`, `SENDER_EMAIL`, `BREVO_API_KEY`, `JWT_SECRET`, `DATABASE_URL`
- **Tier-aware views:** when `?demo=basic|pro|premium` is in URL, body gets `demo-mode` + `tier-X` class
  - `?demo=basic` hides: "Get Yours" nav · hero CTA aside · "Ready to build yours?" · pricing grid
  - `?demo=pro` adds: "Stay connected on social" band + 4 Pro Instagram mockup cards
  - `?demo=premium` adds above + dark "Call or chat anytime" band with voice-bot CTA + 4 Premium spa-themed mockup cards

---

## 3 · Backup / test folders (on disk only, not deployed)

| Path | What | Status |
|---|---|---|
| `C:\MF New\SalonAI - Copy` | April 16 backup (Blue Diamond era) | Reference only |
| `C:\MF New\SalonAI - Copy (2)` | April 21 backup (pre-tier-switcher) | Reference only |
| `C:\MF New\SalonAI - Copy (2) - Copy` | April 23 artifact | Can delete |
| `C:\MF New\claires-salon` | Scaffolder test — Claire's local instance (port 3007) | Test output |
| `C:\MF New\sage-salon` | Pro tier scaffold test (port 3008) | Test output |
| `C:\MF New\vitalis-medspa` | Premium tier scaffold test (port 3009) | Test output |
| `C:\MF New\temp-gen`, `C:\MF New\out` | Scaffolder intermediate data | Can delete |
| `C:\MF New\MoonFlower-Salon-Starter` | Earlier template attempt | Deprecated |
| `C:\MF New\MoonflowerAI-Marketing` | Brand / marketing assets | Reference only |

---

## 4 · Pricing (as decided and currently live)

### Founder pricing — first 10 client salons only (live as of 2026-04-25)

| Tier | Monthly | Setup fee (Founder) | Setup fee (standard, post-10) | Token at intake (20%) |
|---|---|---|---|---|
| **Basic** | **$79** | **$899** | $1,500 | $180 **nonrefundable** |
| **Pro** | **$129** | **$1,499** | $2,500 | $300 **nonrefundable** |
| **Premium** | **$229** | **$1,999** | $3,500 | $400 **nonrefundable** |

After 10 paying clients sign on, the setup fee reverts to the standard rate.
The Founder banner on Salonainew makes this scarcity visible.

**Tier deliverables (also live):**

| Feature | Basic | Pro | Premium |
|---|---|---|---|
| Custom salon website | ✓ | ✓ | ✓ |
| 24/7 AI chat assistant | ✓ | ✓ | ✓ |
| Online booking + calendar | ✓ | ✓ | ✓ |
| Admin dashboard | ✓ | ✓ | ✓ |
| Email + SMS reminders | — | ✓ | ✓ |
| Installable mobile app | — | ✓ | ✓ |
| Social promotion (FB or IG) | — | ✓ | — |
| AI posts per month | 0 | **1** | **4** |
| 4-platform social (TikTok/YT/IG/FB) | — | — | ✓ |
| Voice AI phone assistant | — | — | ✓ (300 min/mo, $0.50/min after) |
| Same-day priority support | — | — | ✓ |

**Margin math (with automation built):**
- Basic: $76 net / 15 min/mo = ~$304/hr
- Pro: $118 net / 30 min/mo = ~$236/hr
- Premium: $134 net / 90 min/mo = ~$89/hr (Voice AI overage upcharges $0.50/min)

**Notes:**
- Stripe live payment **bypassed for now** (form-first flow).
- Monthly subscription starts the day the site goes live.
- Token is 20% of setup, nonrefundable.
- Premium Voice AI capped at 300 included minutes/month; usage tracked in
  `data/voice-usage.json` per tenant; alert emailed at 80% (see §15).
- Ayrshare auto-posting **deferred until 10+ clients** — Y1 strategy is to
  share finished promo assets with clients in 16:9 + 4:5 + 9:16 formats and
  let them post on their own accounts.

---

## 5 · Google Forms / intake

- **Basic form (exists + used):** `https://forms.gle/EzRjjxEsEz7QWbMu8`
  - Sheet: `1aczz5wd3QjDoS5eejYnwpiaZRxw6Q89j7E4jbvlRRtM`
  - Form ID: `1TYYdgLpiFDvC6EB88glR9OVHrUSJFaNuXNh2ROD7Ce4`
- **Pro form:** not created yet — Pro signups land in the Basic form for now
- **Premium form:** not created yet — Premium signups land in the Basic form for now
- **Intent tracking:** tier selection recorded via `?tier=basic|pro|premium` URL param + logged to `data/intake-intents.json` on SalonAI via `/api/moonflower/intent`

---

## 6 · AI integrations

- **Chat (widget on salon sites):** Groq — `llama-3.3-70b-versatile`, fallback `llama-3.1-8b-instant`
  - Replaced Anthropic earlier (~30× cheaper)
  - Wired in `SalonAI/routes/chat.js`
- **Content pack generation:** Groq (captions) + Flux Schnell on Replicate (images)
  - Script: `SalonAI/scripts/content-pack.mjs`
  - Cost: ~$0.003/image + ~$0.003/caption batch → ~$0.02 per client per month
- **Client image generation:** Flux Schnell on Replicate
  - Script: `SalonAI/scripts/generate-client-images.mjs`
  - Produces hero + 4 gallery + per-stylist "at-work" shots

---

## 7 · The automation pipeline (in `SalonAI/plans/`)

```
plans/
├── README.md, setup.md, forms.config.mjs
├── basic/CLAUDE.md    + provision.mjs + templates/
├── pro/CLAUDE.md      + provision.mjs + monthly-content.mjs + templates/
├── premium/CLAUDE.md  + provision.mjs + templates/
└── shared/
    ├── scripts/{send-email, register-client, cancel-client,
    │            create-tier-form, poll-intakes}.mjs
    └── templates/_base.html
```

**How onboarding flows end-to-end:**

1. Prospect visits `moonflowerai.com/salonai` → redirects to Salonainew
2. Clicks **Sign up for [Tier]** → opens Google Form with `?tier=` tag
3. Fills form → new row in Sheet → `plans/shared/scripts/poll-intakes.mjs` cron detects it
4. Poller runs `plans/<tier>/provision.mjs --slug=<name> --row=<N>`
5. Provisioner: scaffolds client app · creates GitHub repo · deploys to Railway · seeds Postgres · sends launch email
6. Client site goes live at its own URL

---

## 8 · Claire's Salon & Spa data (the fictional demo client)

- **Owner (fictional):** Claire Lizboune
- **Location:** 2145 Frankfort Avenue, Louisville, KY 40206 (Highlands)
- **Services:** 17 hair services (cuts, color, treatments, styling, extensions)
- **Staff:** 5 stylists — Claire, Marcus, Priya, Taylor, Jordan
- **Reviews:** 5 seeded reviews
- **Theme color:** turquoise (`#14b8a6`)
- **AI images:**
  - 3 hero images (`hero-basic.jpg`, `hero-pro.jpg`, `hero-premium.jpg`)
  - 4 gallery shots
  - 5 staff at-work shots
  - 8 social feed mockups (4 Pro hair-themed + 4 Premium spa-themed)
- **All data in:** `SalonAI/data/*.json` + seeded to Postgres via `seed.js`

---

## 9 · Current state of what's deployed

| Service | Status | Last commit deployed |
|---|---|---|
| Demo1 (`moonflowerai.com`) | ✅ Live, redirects `/salonai` | `443f4f4` |
| Salonainew (`salonainew-production...`) | ✅ Live, Founder pricing + 4 promo dropdown | `e85d148` |
| SalonAI (`salonai-production...`) | ✅ Live, voice tracker + Ayrshare endpoints + 4 seasonal videos | `b41d09a` |

---

## 10 · Legal / business state

Full details in `legal/LEGAL-SETUP.md`. Contract template in `legal/MSA-template.md`.

| Item | Status |
|---|---|
| MoonFlower AI LLC registration | ✅ Done (KY) |
| EIN from IRS | ✅ Issued |
| Privacy Policy + Terms of Service pages | ✅ Live on all client sites |
| MSA template drafted | ✅ `legal/MSA-template.md` (ready for lawyer review) |
| Legal setup checklist | ✅ `legal/LEGAL-SETUP.md` |
| Business bank account (Mercury recommended) | ❌ Not opened yet |
| Rocket Lawyer subscription + final MSA | ❌ Not done |
| HelloSign / DocuSign e-sign | ❌ Not set up |
| Business insurance (General + E&O + Cyber) | ❌ Not purchased |
| KY sales tax permit | ❌ Not registered |
| Stripe Tax | ❌ Not enabled |
| USPTO trademark on "MoonFlower AI" | ❌ Not filed |

---

## 11 · What's shipped ✅ vs pending ❌

### Shipped
- ✅ Salonainew landing page (Founder pricing + Demo dropdown + Social Media Promos dropdown)
- ✅ Founder pricing for first 10 clients ($79/$129/$229 + $899/$1,499/$1,999 setup)
- ✅ Claire's salon demo with tier-aware `?demo=` views
- ✅ Automation pipeline scaffolder + CLAUDE.md runbook per tier
- ✅ Content pack generator (Groq captions + Flux images)
- ✅ Per-client image generator (hero + gallery + staff)
- ✅ **4 seasonal promo videos** (Spring/Summer/Fall/Holiday) — full pipeline
- ✅ **Canonical brand storefront image** (sign composited via sharp, sampled facade color)
- ✅ **Voice AI minute tracker** (Premium 300 min cap, Twilio statusCallback, 80% email alert)
- ✅ **Ayrshare integration code** (dormant — env-gated until 10+ clients)
- ✅ **Local post-approval queue** (drafts saved before going to Ayrshare)
- ✅ **3 voice presets** locked in `lib/voices.mjs` with campaign mapping
- ✅ `make-promo.mjs` end-to-end pipeline (xAI Grok brief → Flux frames → MiniMax narration → ffmpeg mux)
- ✅ `moonflowerai.com/salonai` routed to Salonainew (#basic anchor)
- ✅ Privacy Policy + Terms of Service pages
- ✅ TCPA-compliant SMS consent in booking
- ✅ Groq replaces Anthropic for chat (~97% cost reduction)
- ✅ File-based DB fallback so sites run without Postgres locally
- ✅ Tombstone service worker killing old PWA cache

### Pending (in priority order)
- ❌ **Multi-tenant scaffolder CLI** (`npm run new-client <slug>`) — biggest unlock for client #2+
- ❌ **Stripe live payments** (deposit + monthly subscription + webhooks)
- ❌ **Admin UI for post-approval queue** (browse drafts, click approve/reject)
- ❌ **Weekly chat-log AI health report** (Groq summarizes, emails operator)
- ❌ **Build deliverables script** (output 16:9 + 4:5 + 9:16 versions per campaign as ZIP)
- ❌ Pro + Premium Google Forms (currently all tiers use Basic form)
- ❌ Real onboarding of first paying client
- ❌ Legal items in §10 above (Mercury, Rocket Lawyer, HelloSign, insurance, KY sales tax)
- ❌ Cold email template + outreach list
- ❌ moonflowerai.com (no www) returns 404 — DNS/Railway domain config fix
- ❌ Voice AI implementation itself (Twilio Voice + STT/TTS) — tracker is built, the actual AI handler is not
- ❌ Regional domain registrations (Lex / Cincinnati / Nashville / Indy)

### 🎯 Tomorrow's priorities (2026-04-24)

1. **Social media interface** — a management surface for salon owners to:
   * Review the monthly AI-generated content pack before it publishes
   * Approve / edit / regenerate individual posts
   * See which platforms are connected (IG, FB, TikTok, YouTube)
   * Clarify with user: admin UI on each salon site, or centralized dashboard?

2. **Hook up Stripe** — flip from form-first to actual payment collection:
   * Collect 20% nonrefundable token on form submission
   * Set up recurring monthly subscription starting on launch day
   * Webhook handler for `checkout.session.completed`
   * Set Stripe live keys + webhook secret on Railway
   * End-to-end test with `4242 4242 4242 4242` then go live

3. **Legal documentation** — close out §10:
   * MSA template + HelloSign / DocuSign signing flow
   * Business insurance (General + E&O + Cyber)
   * KY sales tax permit + Stripe Tax
   * (Optional) USPTO trademark on "MoonFlower AI"

4. **Generate REAL video loops for Pro + Premium social promo** — short
   AI-generated video clips (5–10 sec) showing actual motion, not animated
   stills. Per tier:
   * Pro tier: hair-salon short loops — brush strokes, color application,
     blow-dryer motion, scissor cuts
   * Premium tier: spa-themed short loops — hands pouring oil, steam rising,
     facial mask application, massage stones
   * **Provider: Replicate** (already have API token, same account we use
     for Flux image gen). Models to try on Replicate:
     - `luma/ray-2-720p` — highest quality human-hand close-ups, ~$0.40/clip
     - `luma/ray-flash-2-720p` — faster + cheaper Luma, ~$0.20/clip
     - `kwaivgi/kling-v2.1-master` — alternative, ~$0.30/clip
   * Cost budget: ~$3 total for all 8 clips (4 Pro + 4 Premium)
   * Storage: `SalonAI/public/videos/social/{pro,premium}/clip-[1-4].mp4`
   * Embed in the tier social feed grid as autoplay muted loops
     (replaces or sits alongside the still-image posts)

---

## 12 · Recent decisions (timeline of "why we did what")

- **Apr 22:** Chose form-first flow, Stripe bypassed; Token = 20% of setup
- **Apr 22:** Chose pricing tiers $99/$149/$249 monthly · $1500/$2500/$3500 setup
- **Apr 23 (early):** Added 3-tier demo switcher with per-tier heroes + showcases
- **Apr 23 (mid):** Rolled back the switcher because it was too complex — simplified
- **Apr 23 (evening):** Split into two deploys:
  - Salonainew = landing (pricing + Demo dropdown)
  - SalonAI = actual Claire's demo with `?demo=` tier views
- **Apr 23 (late):** Restored tier-specific showcases + social feeds on `?demo=pro|premium`
- **Apr 23 (late):** Changed "refundable" → "nonrefundable" on all token language
- **Apr 24:** AI video generation (Luma Ray 2 + Flash 2) produced sterile
  B-roll instead of salon action. Lesson learned: current AI video is not
  production-ready for realistic salon/spa service delivery. Path forward:
  stock footage (Pexels / Envato / Artgrid) or real client phone footage.
- **Apr 25 (morning):** Pivot — built `make-promo.mjs` pipeline with
  Flux 1.1 Pro Ultra + xAI Grok + MiniMax Speech-02 HD + ffmpeg crossfades.
  Result: 4 seasonal campaign videos (Spring/Summer/Fall/Holiday) at
  ~$0.40 each, fully automated from a single command. Quality is
  magazine-grade because we use still frames + crossfades instead of
  attempting motion synthesis.
- **Apr 25 (afternoon):** Locked canonical Claire's storefront image.
  Sign text "CLAIRE'S SALON & SPA" composited via sharp (Flux can't
  reliably render single-line text); panel background sampled from the
  actual facade color so it blends. Same canonical reused for every
  campaign's frame 1.
- **Apr 25 (afternoon):** Voice preset system. Three approved voice
  combinations saved in `lib/voices.mjs` with campaign-to-voice mapping.
  Phonetic spelling "Klaire's" forces correct MiniMax pronunciation.
- **Apr 25 (afternoon):** Pricing revision. Monthly $99/$149/$249 →
  $79/$129/$229. Setup fees discounted for first 10 clients
  ($899/$1,499/$1,999) with Founder banner on the landing page.
  Email + SMS reminders moved Basic → Pro. Pro AI posts 4/mo → 1/mo.
  Premium AI posts 12/mo → 4/mo. Premium Voice AI capped at 300 min/mo.
- **Apr 25 (afternoon):** Salonainew nav cleaned. Removed hero promo
  video and Book Now/Chat With Us buttons (those belong on a salon's
  own site, not on the marketing page). Added "Social Media Promos"
  dropdown linking to all 4 seasonal videos. Hero overlay reduced to
  ~25% opacity so the background photo is visible.
- **Apr 25 (evening):** Built Voice AI minute tracker (Premium 300/mo cap
  with $0.50 overage rate, 80% email alert). Built Ayrshare integration
  + local post-approval queue (dormant — Y1 strategy is operator-shared
  assets, no auto-posting until 10+ clients).
- **Apr 25 (evening):** Decision — Y1 deliverable model is share-with-client.
  We render finished assets in 16:9 + 4:5 + 9:16 formats and the salon
  owner posts on their own platforms. Skips Ayrshare's $149/mo until
  scale justifies it.

---

## 15 · Seasonal campaign pipeline (added 2026-04-25)

End-to-end automation: one command produces a full seasonal promo (5
images + caption + voiceover + final 21s video) from a campaign brief
written by xAI Grok. Runs on the SalonAI repo.

### Files

```
SalonAI/scripts/
├── make-promo.mjs                      One-command pipeline runner
├── rebuild-narration.mjs               Audio iteration helper (voice/speed/pitch/volume)
├── generate-salonai-promo.mjs          Multi-frame image generator (legacy + canonical)
├── build-promo-video.mjs               ffmpeg crossfade stitcher
├── build-promo-narration.mjs           Spring Reset narration generator
├── build-promo-final.mjs               Audio + caption-overlay muxer
├── lib/
│   ├── brand.mjs                       Canonical brand (storefront prompt,
│   │                                   useCanonicalStorefront(), sharp text overlay
│   │                                   that samples facade color so the sign blends)
│   └── voices.mjs                      Three approved voice presets + slug → preset map

SalonAI/campaigns/
├── summer-glow.json
├── fall-refresh.json
└── holiday-glam.json
```

### How it runs

```
node scripts/make-promo.mjs --slug=fall-refresh --name="Fall Refresh"
```

Steps the pipeline performs:
1. xAI Grok writes campaign brief (5 frame prompts, narration script, 5 caption overlays, single carousel caption + 22 hashtags)
2. Saves brief to `campaigns/<slug>.json`
3. Generates 5 frames via Flux 1.1 Pro Ultra on Replicate (frame 1 = canonical storefront, copied not generated)
4. MiniMax Speech-02 HD reads the narration in the campaign's assigned voice preset
5. ffmpeg stitches frames with 1s crossfades → silent 21s video
6. ffmpeg burns the 5 timed caption overlays + muxes the audio → final video
7. Outputs in `public/videos/promo/<slug>/{narration.mp3, silent.mp4, final.mp4}`

### Cost per campaign

~$0.40 (~$0.005 Grok + 4 × $0.06 Flux Pro Ultra + canonical reuse for frame 1 + $0.003 MiniMax + ffmpeg free).

### Canonical brand storefront

Locked at `public/images/brand/storefront-canonical.webp`. Every campaign
reuses this same image for frame 1, guaranteeing brand consistency across
seasons. To regenerate the canonical (e.g., new branding direction), delete
the file and run any pipeline once OR pass `--regenerate-storefront`.

The storefront has the "CLAIRE'S SALON & SPA" sign **composited via sharp**
(not generated by Flux) because Flux can't reliably render that exact
single-line text. The sign's panel background is sampled from the actual
facade color so it blends naturally.

### Voice presets (in `lib/voices.mjs`)

| Preset | MiniMax voice | Settings | Used for |
|---|---|---|---|
| voice-1 | English_radiant_girl | speed 1.13, pitch 0, vol 2.5, happy | Spring Reset, Fall Refresh |
| voice-2 | English_FriendlyPerson | speed 1.13, pitch 0, vol 2.5, happy | Holiday Glam |
| voice-3 | English_Sweet_Female_4 | speed 1.13, pitch 0, vol 2.5, happy | Summer Glow |

Phonetic spelling **"Klaire's"** in narration script forces correct
pronunciation (MiniMax mispronounces "Claire's" with the apostrophe-s).

### Campaigns currently live

| Campaign | Slug | Voice | URL |
|---|---|---|---|
| Spring Reset | reset-week | voice-1 | `salonai-production.../videos/promo/reset-week-promo-final.mp4` |
| Summer Glow | summer-glow | voice-3 | `.../videos/promo/summer-glow/final.mp4` |
| Fall Refresh | fall-refresh | voice-1 | `.../videos/promo/fall-refresh/final.mp4` |
| Holiday Glam | holiday-glam | voice-2 | `.../videos/promo/holiday-glam/final.mp4` |

All four also synced to Salonainew at the same paths.

---

## 16 · Voice AI minute tracker (added 2026-04-25)

Per-tier monthly cap enforcement for the Premium Voice AI feature.

### Files

```
SalonAI/lib/voice-usage.js               Cap logic + recordVoiceCall() + getUsageStatus()
SalonAI/routes/voice.js                  Twilio status callback + admin usage endpoint
SalonAI/data/voice-usage.json            Per-tenant per-month usage rows
```

### Endpoints

```
POST /t/<slug>/api/voice/twilio/status-callback   Twilio fires this when a call ends
GET  /t/<slug>/api/voice/usage                    Live JSON with percent used + overage $$
```

### Cap rules

| Tier | Cap | Overage |
|---|---|---|
| Basic | 0 min | n/a (no Voice AI) |
| Pro | 0 min | n/a (no Voice AI) |
| Premium | 300 min/mo | $0.50/min after cap |

**Alert at 80%:** when usage crosses 80% of cap, fires one email to
`OPERATOR_ALERT_EMAIL` (default: raokgoli@gmail.com) via Brevo. Without
`BREVO_API_KEY` set, the alert console.warn()s instead.

### To activate per Premium tenant

1. Provision a Twilio phone number for the salon
2. In Twilio console, set the number's **status callback URL** to:
   `https://salonai-production.up.railway.app/t/<slug>/api/voice/twilio/status-callback`
3. Voice usage now tracked automatically per call

---

## 17 · Ayrshare integration (added 2026-04-25, dormant)

Built but not activated — Year 1 strategy is to share finished assets
with clients (16:9 + 4:5 + 9:16 formats) and let them post manually.
Ayrshare wakes up at 10+ clients when its $149/mo justifies itself.

### Files

```
SalonAI/lib/ayrshare.js                 schedulePost / listPosts / deletePost / isEnabled
SalonAI/routes/posts.js                 Per-tenant Ayrshare endpoints + local approval queue
SalonAI/data/post-queue.json            Drafts pending operator approval
```

### Endpoints

```
GET    /api/posts                       List recent posts (Ayrshare history)
POST   /api/posts/schedule              Schedule a post directly
DELETE /api/posts/:id                   Cancel a scheduled post
GET    /api/posts/queue                 List pending-approval drafts
POST   /api/posts/queue                 Save a draft to the local queue
POST   /api/posts/queue/:id/approve     Approve a draft → push to Ayrshare
POST   /api/posts/queue/:id/reject      Reject a draft (no API call)
```

Env-gated by `AYRSHARE_API_KEY`. Per-tenant `business.ayrshareProfileKey`.

---

## 18 · Year 1 strategy (added 2026-04-25)

- **Posting:** we deliver finished assets in 16:9, 4:5, 9:16 formats.
  Salon owner posts on their own platforms. No Ayrshare cost.
- **Pricing:** Founder rate ($79/$129/$229 monthly · $899/$1,499/$1,999
  setup) for first 10 clients. Reverts to standard after.
- **Target:** 10 clients by end of Y1. Effective hourly rate ~$285/hr at
  full ramp (after automation builds).
- **Goal hourly:** $100/hr minimum.

---

## 14 · Working rules / lessons learned

Rules of engagement we've established so we don't repeat mistakes:

1. **Video / image generation — test ONE first.** Never generate a full
   batch of 8+ clips before confirming a single clip's quality. Generate 1,
   review, iterate on prompt, THEN batch. This rule applies to any expensive
   API call (Flux, Luma Ray, Kling, Sora, Runway, etc.).
2. **Don't rewrite — surgical edits.** When user asks for a specific change,
   change only that element. Don't restructure surrounding code. Don't
   propose new features. Confirm scope before touching anything big.
3. **Ask before over-reaching.** If a request is ambiguous, ask 1-2
   clarifying questions before building. Never assume the user wants more
   than they said.
4. **AI video for social content is currently unreliable.** Prefer stock
   footage libraries (Pexels free, Envato $16.50/mo, Artgrid $9.99/mo) or
   real client phone footage for production social media content.
5. **Never push to Railway without explicit approval.** Commit locally,
   wait for user to verify on `localhost:3006` (SalonAI) or the relevant
   local port, then push only after user says it's good. "Don't upload to
   Railway" is the default — treat every commit as local-only until told
   otherwise.

---

## 13 · How to pick up where we left off

When resuming work, read this file top to bottom. Then check:
1. `git log -5` in each of the 3 main project folders (Demo1, SalonAInew, SalonAI) to see recent commits
2. The "Pending" list in §11 for what needs to happen next
3. Railway dashboards for current deploy status of each service
