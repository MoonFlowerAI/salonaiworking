# Legal & Business Setup Checklist

**Everything that needs to happen OUTSIDE the code so MoonFlower AI LLC can
legally sign its first paying client. Organized by priority and effort.**

Last updated: 2026-04-24

---

## Status legend
- 🔴 Must do before first client signs
- 🟠 Do within 30 days of first client
- 🟡 Do within 90 days of first client
- 🟢 Optional / nice-to-have

---

## 🔴 1. Business bank account (Mercury recommended)

**Why:** You must keep business money separate from personal. If you don't,
you lose the LLC's liability protection ("piercing the corporate veil").
Every Stripe deposit, Railway bill, Groq invoice must flow through the
business account.

**Fastest path: Mercury**
- Site: https://mercury.com
- Cost: $0/month (no minimum balance)
- Approval: usually same-day online
- Needed: LLC articles of organization (from KY Secretary of State),
  EIN letter from IRS (you have both already)

**Alternatives:** Novo (online, free), Chase Business Complete ($15/mo),
Capital One Business (free tier).

**After opening:**
1. Move Railway / Groq / Replicate / Brevo / Google Workspace billing
   to the new account (10 minutes per service, do them all in one sitting)
2. Stop using personal card for any business expense

---

## 🔴 2. Master Services Agreement (MSA) via Rocket Lawyer

**What:** The template you'll send every client to sign.
**Template drafted:** See `legal/MSA-template.md` in this repo.

**Steps:**
1. Sign up at https://www.rocketlawyer.com — $39.99/mo or one-time doc $59
2. Search their template library for "services agreement" or "master
   services agreement"
3. Compare to `MSA-template.md` — pull in anything Rocket Lawyer's
   Kentucky-specific template covers that we missed (arbitration clauses,
   KY-specific notice language)
4. Export the merged doc as PDF
5. Upload to HelloSign / DocuSign for e-signature flow

**Optional but recommended:** One-time $300–$800 review by a KY small-business
attorney. Search "Kentucky small business attorney MSA" or ask your network.

---

## 🔴 3. E-signature service (HelloSign or DocuSign)

**Why:** Clients sign the MSA electronically — much faster than printing,
signing, scanning.

**Options:**
- **HelloSign (by Dropbox):** $15/mo, 3 users, simple UI. Good for solo founder.
- **DocuSign Personal:** $15/mo, 5 docs/mo. Better if you'll go beyond 5/mo.

**Setup:**
1. Sign up
2. Upload the finalized MSA PDF as a template with signature fields marked
3. For each new client: generate a filled copy, send via the service,
   they click + sign, you get a notification + signed PDF

---

## 🔴 4. Privacy Policy & Terms of Service (already done)

These are already in the SalonAI codebase:
- `SalonAI/public/privacy.html`
- `SalonAI/public/terms.html`

Each client's generated site has their business info auto-populated via the
scaffolder's token substitution.

**Nothing to do here.** Just confirm the pages show Claire's info on the
Claire's demo, which we've verified.

---

## 🟠 5. Business insurance

**Why:** When a client sues (and one will, eventually), insurance pays
the legal fees. Without it, even a nuisance suit costs $5k–$50k out of
pocket before any judgment.

**Minimum coverage for a solo SaaS founder:**

| Policy type | Annual cost | What it covers |
|---|---|---|
| **General Liability** | $400–$600 | Slip-and-fall at your office, basic third-party claims |
| **Professional Liability (E&O)** | $500–$800 | Client claims your software caused them loss |
| **Cyber Liability** | $600–$1,200 | Data breach, ransomware, customer notification costs |
| **Total** | **~$1,500–$2,500/year** | |

**Providers** (all give online quotes in 10 min):
- Hiscox — https://www.hiscox.com
- Next Insurance — https://www.nextinsurance.com
- Thimble — https://www.thimble.com
- The Hartford — https://www.thehartford.com

**Per-client cost pass-through:** $1,500/yr ÷ 20 clients = $75/yr each,
or ~$6.25/month. Barely registers in your margins.

**Get at least 2 quotes, pick the cheapest with E&O included.**

---

## 🟠 6. Kentucky Sales Tax Permit

**Why:** As of 2023, KY taxes SaaS/software-as-a-service. Your Railway
hosting + software component is subject to KY sales tax when the customer
is a KY business.

**Rate:** 6% on taxable services delivered to KY buyers.

**Setup steps:**
1. Go to https://onestop.ky.gov or https://revenue.ky.gov
2. Register for a Sales and Use Tax permit (free)
3. You'll get a 9-digit permit number and a filing schedule (monthly or
   quarterly depending on volume)
4. Add the permit number to your invoices

**Filing:** File sales tax returns on the schedule KY assigns. Usually
free online. At low volume (< $50k/yr taxable) it's quarterly.

**Other states:** Only register in states where you have "nexus"
(a client located there + ongoing sales). For now, register KY only.
Expand as you land clients in other states.

---

## 🟠 7. Stripe Tax (auto-calculate per state)

**Why:** When you add clients in other states, each has its own sales tax
rate. Stripe Tax auto-calculates and collects the right amount.

**Cost:** 0.5% per transaction (on top of normal Stripe fees).

**Setup:**
1. In Stripe Dashboard → Tax → Enable
2. Add your company address (KY)
3. Mark your products as "taxable service" or "digital service"
4. When clients check out, Stripe automatically adds the right tax

**Note:** Stripe Tax files returns for you in states where you've
registered. You still need to register in KY manually via step 6 above;
Stripe handles the rest once registered.

---

## 🟡 8. USPTO trademark on "MoonFlower AI"

**Why:** Protects the brand name. Prevents a competitor from registering
"MoonFlower AI" and forcing you to rename.

**Cost:** $350 filing fee per class (Class 42: software services is what
you need). Optional attorney assistance $500–$1,500.

**Steps:**
1. Search first: https://tmsearch.uspto.gov — verify "MoonFlower AI" or
   similar isn't already registered in Class 42
2. File online at https://www.uspto.gov/trademarks
3. Wait 6–12 months for approval

**Do this within 12 months** of first revenue. Not urgent today.

---

## 🟡 9. Contract archive + record-keeping

**Simple system:**
```
C:\MF New\SalonAInew\contracts\
├── <client-slug>\
│   ├── msa-signed.pdf        (download from HelloSign after signature)
│   ├── intake-responses.pdf  (print Google Form response as PDF)
│   ├── invoices\             (Stripe-generated PDFs)
│   └── emails\               (important threads)
```

Keep at least 7 years per IRS / KY tax record retention rules.

Back up the `contracts/` folder to an encrypted cloud drive (Dropbox,
iCloud, Google Drive). Encryption matters because these folders contain
customers' personal info.

---

## 🟡 10. Cyber liability — client data processing

**If** you process health-adjacent data (medspa clients with injectables,
laser services), review whether HIPAA applies. For most salons, no.

For all salons: make sure the Privacy Policy accurately lists every
third-party service that touches customer data:
- Groq (chat conversations)
- Brevo (email delivery)
- Twilio (SMS delivery)
- Stripe (payments, if enabled)
- Railway (hosting the database)
- Replicate (image/video generation for content packs — no customer data)

Our current `privacy.html` covers this generically. Good enough for now.

---

## 🟢 11. Lawyer on retainer (optional)

When you have 5+ clients and something legally complex comes up (a client
threatens to sue, a customer files a data complaint, you want to do a
deal with an influencer), having a lawyer on retainer saves stress.

- **Cost:** $1,500–$3,000/year for 5–10 hours of phone time
- **Who:** Any KY small-business attorney. Ask the Louisville Chamber of
  Commerce for referrals.

**Not urgent for solo-founder + first 5 clients.**

---

## Summary — what to do THIS WEEK

1. 🔴 Open Mercury business bank account (30 min)
2. 🔴 Sign up for Rocket Lawyer + get MSA finalized (1 hour)
3. 🔴 Set up HelloSign (30 min)
4. 🟠 Get 2 insurance quotes (1 hour, mostly waiting for quotes)

**Total time investment: ~3 hours of your time.**
**Total cost this week:** ~$100 (Rocket Lawyer doc + HelloSign first month).
**Total cost this year:** ~$2,000 including insurance.
**Resulting state:** legally ready to sign your first paying client.

---

## What's ALREADY done

- ✅ LLC registered in KY
- ✅ EIN issued by IRS
- ✅ Privacy Policy and Terms of Service pages live
- ✅ SMS TCPA consent captured on booking
- ✅ MSA template drafted (see `MSA-template.md`)
- ✅ This checklist

When you complete an item above, move it into this "✅" section with a date
and the confirmation/policy number. That way `PROJECT.md` §10 stays
accurate.
