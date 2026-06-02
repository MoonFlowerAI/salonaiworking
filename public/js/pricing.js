// MoonFlower AI pricing card renderer.
// DEMO-ONLY file — not shipped to client salon apps.
//
// Flow: click a tier → log soft intent → route to that tier's Google Form.
// Payment is deferred (no Stripe on the initial click). Once a prospect
// submits the form, our auto-provisioning kicks in and their site is built.
// Payment is collected later via invoice.
(function () {
  'use strict';

  const grid = document.getElementById('mfPricingGrid');
  if (!grid) return;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function renderCard(plan) {
    const featuresHtml = plan.features.map(f =>
      `<li><svg class="mf-plan-check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span>${escapeHtml(f)}</span></li>`
    ).join('');

    // CTA label + disabled state depend on whether the tier's intake form is ready.
    // If the form isn't created yet (Pro/Premium), show a friendly "notify me" button.
    const ctaLabel = plan.intakeReady
      ? `Reserve ${escapeHtml(plan.name)} — ${escapeHtml(plan.token || '')} token →`
      : `Notify me when ${escapeHtml(plan.name)} opens`;
    const ctaDisabled = !plan.intakeReady;

    return `
      <div class="mf-plan ${plan.highlight ? 'mf-plan--highlight' : ''}" data-plan="${escapeHtml(plan.id)}">
        ${plan.highlight ? '<div class="mf-plan-badge">Most popular</div>' : ''}
        <div class="mf-plan-head">
          <h3 class="mf-plan-name">${escapeHtml(plan.name)}</h3>
          <p class="mf-plan-tagline">${escapeHtml(plan.tagline)}</p>
        </div>
        <div class="mf-plan-price">
          <div class="mf-plan-monthly"><span class="mf-plan-amt">${escapeHtml(plan.monthly)}</span><span class="mf-plan-per">/month</span></div>
          <div class="mf-plan-setup">${escapeHtml(plan.setup)} one-time setup</div>
        </div>
        <div class="mf-plan-token">
          <div class="mf-plan-token-amt">${escapeHtml(plan.token || '')}</div>
          <div class="mf-plan-token-label">20% nonrefundable token<br/>due at intake submission</div>
        </div>
        <ul class="mf-plan-features">${featuresHtml}</ul>
        <button class="mf-plan-cta" type="button"
                data-plan-id="${escapeHtml(plan.id)}"
                data-form-url="${escapeHtml(plan.intakeFormUrl || '')}"
                ${ctaDisabled ? 'disabled' : ''}>
          ${ctaLabel}
        </button>
        ${plan.intakeReady
          ? `<p class="mf-plan-note">Balance of ${escapeHtml(plan.balance || '')} invoiced only after your site goes live and you approve. Monthly ${escapeHtml(plan.monthly || '')} starts on launch day.</p>`
          : '<p class="mf-plan-note">Intake opens soon. Drop your email and we\'ll reach out.</p>'}
      </div>
    `;
  }

  async function loadPlans() {
    try {
      const res = await fetch('/api/moonflower/plans', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('plans_fetch_failed');
      const data = await res.json();
      if (!data.plans || !data.plans.length) throw new Error('no_plans');
      grid.innerHTML = data.plans.map(renderCard).join('');
      wireCtaButtons();
    } catch (err) {
      console.error('[pricing] load error:', err);
      grid.innerHTML = `<div class="mf-pricing-error">
        Pricing is temporarily unavailable. Email
        <a href="mailto:hello@moonflowerai.com">hello@moonflowerai.com</a> to get started.
      </div>`;
    }
  }

  function wireCtaButtons() {
    grid.querySelectorAll('.mf-plan-cta').forEach(btn => {
      btn.addEventListener('click', onCtaClick);
    });
  }

  async function onCtaClick(e) {
    const btn = e.currentTarget;
    if (btn.disabled) return;
    const planId = btn.dataset.planId;
    const formUrl = btn.dataset.formUrl;
    if (!planId || !formUrl) {
      alert("We couldn't find the intake form for this plan. Please email hello@moonflowerai.com.");
      return;
    }

    // Ask for an email (light-touch — not required).
    // Lets us follow up with anyone who bounces from the intake form without
    // submitting. Prospect can skip by hitting Cancel.
    let email = '';
    try {
      email = (window.prompt('Your email (optional — helps us follow up if you get stuck on the form):') || '').trim();
    } catch { /* prompt blocked — continue anyway */ }

    // Log intent (never blocks the redirect — fire-and-forget with a short
    // timeout).
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);
      await fetch('/api/moonflower/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, email, source: 'pricing-card' }),
        signal: controller.signal,
      }).catch(() => {});
      clearTimeout(timeout);
    } catch { /* never block navigation */ }

    // Redirect to the tier's intake form.
    const url = new URL(formUrl);
    // If Google Form has an "Email address" prefill slot, we could pre-fill here.
    // For now, just open the form so the prospect can fill it top-to-bottom.
    window.location.href = url.toString();
  }

  loadPlans();
})();
