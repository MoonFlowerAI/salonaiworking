/**
 * Feedback routes — triggered by SMS link after a completed appointment.
 *
 * GET /feedback/:apptId          — renders a simple 1-5 star rating page
 * POST /feedback/:apptId         — records the feedback, redirects appropriately:
 *                                     4-5 stars → Google review URL (if set)
 *                                     1-3 stars → /feedback/:apptId/thanks (private form)
 * GET /feedback/:apptId/thanks   — "thank you, we'll reach out" page
 *
 * Data model (new `feedback` collection):
 *   { id, appointmentId, customerName, customerEmail, rating, comment, createdAt, routedTo }
 */

const express = require('express');
const router = express.Router();
const { readCollection, writeCollection } = require('../db');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  auth: {
    user: process.env.BREVO_SMTP_USER,
    pass: process.env.BREVO_API_KEY
  }
});

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPage(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root { --rose:#b76e79; --dark:#1a1a2e; --cream:#faf3e0; --gray:#666; }
    *,*::before,*::after { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:'Poppins',sans-serif; background:var(--cream); color:var(--dark); min-height:100vh; display:flex; align-items:center; justify-content:center; padding:20px; }
    .card { background:#fff; border-radius:16px; padding:40px 32px; max-width:480px; width:100%; box-shadow:0 10px 40px rgba(0,0,0,0.08); text-align:center; }
    h1 { font-family:'Playfair Display',serif; color:var(--dark); margin-bottom:12px; font-size:1.75rem; }
    p.sub { color:var(--gray); margin-bottom:28px; line-height:1.5; }
    .stars { display:flex; justify-content:center; gap:8px; margin:24px 0; }
    .star { font-size:2.4rem; cursor:pointer; color:#ddd; transition:color 0.2s, transform 0.15s; background:none; border:none; padding:4px; }
    .star:hover, .star.active { color:var(--rose); transform:scale(1.1); }
    .star.filled { color:var(--rose); }
    textarea { width:100%; padding:12px; border:1px solid #e0e0e0; border-radius:8px; font-family:inherit; font-size:0.95rem; resize:vertical; min-height:80px; margin:12px 0; }
    textarea:focus { outline:none; border-color:var(--rose); box-shadow:0 0 0 3px rgba(183,110,121,0.12); }
    button.submit { background:var(--rose); color:#fff; border:none; padding:12px 32px; border-radius:50px; font-size:1rem; font-weight:600; cursor:pointer; font-family:inherit; transition:transform 0.2s,box-shadow 0.2s; }
    button.submit:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 4px 14px rgba(183,110,121,0.28); }
    button.submit:disabled { opacity:0.5; cursor:not-allowed; }
    .brand { color:var(--rose); font-weight:600; }
    .small { font-size:0.85rem; color:var(--gray); margin-top:20px; }
  </style>
</head>
<body>
  <div class="card">${bodyHtml}</div>
</body>
</html>`;
}

// GET /feedback/:apptId  (rating page)
router.get('/:apptId', async (req, res) => {
  try {
    const appointments = await readCollection('appointments', req.tenantId) || [];
    const appt = appointments.find(a => a.id === req.params.apptId);
    const business = await readCollection('business', req.tenantId) || {};

    if (!appt) {
      return res.status(404).send(renderPage('Not Found', `
        <h1>We couldn't find that appointment</h1>
        <p class="sub">The link may have expired or been mistyped.</p>
      `));
    }

    // If already rated, show thank-you
    if (appt.feedback && appt.feedback.rating) {
      return res.send(renderPage('Thanks!', `
        <h1>Thanks for your feedback</h1>
        <p class="sub">You've already shared your thoughts about this visit. We appreciate it.</p>
      `));
    }

    const body = `
      <h1>How was your visit?</h1>
      <p class="sub">Hi ${escapeHtml(appt.customerName.split(' ')[0])} — tell us how <span class="brand">${escapeHtml(business.name || 'we')}</span> did on your ${escapeHtml(appt.serviceName)}.</p>
      <form method="POST" action="/feedback/${escapeHtml(appt.id)}" id="form">
        <div class="stars" id="stars">
          ${[1,2,3,4,5].map(n => `<button type="button" class="star" data-rating="${n}" aria-label="${n} stars">★</button>`).join('')}
        </div>
        <input type="hidden" name="rating" id="ratingInput">
        <textarea name="comment" placeholder="Tell us more (optional)"></textarea>
        <button type="submit" class="submit" id="submitBtn" disabled>Submit</button>
      </form>
      <script>
        (function(){
          var current = 0;
          var stars = document.querySelectorAll('.star');
          var input = document.getElementById('ratingInput');
          var btn = document.getElementById('submitBtn');
          stars.forEach(function(s){
            s.addEventListener('click', function(){
              current = Number(s.dataset.rating);
              input.value = current;
              stars.forEach(function(st,i){
                st.classList.toggle('filled', i < current);
              });
              btn.disabled = false;
            });
          });
        })();
      </script>
    `;
    res.send(renderPage('How was your visit?', body));
  } catch (err) {
    console.error('[feedback] GET error:', err);
    res.status(500).send(renderPage('Error', `<h1>Something went wrong</h1>`));
  }
});

// POST /feedback/:apptId  (submit rating)
router.post('/:apptId', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const rating = Math.min(5, Math.max(1, parseInt(req.body.rating, 10) || 0));
    const comment = (req.body.comment || '').slice(0, 2000);
    if (!rating) return res.redirect(`/feedback/${req.params.apptId}`);

    const appointments = await readCollection('appointments', req.tenantId) || [];
    const idx = appointments.findIndex(a => a.id === req.params.apptId);
    if (idx === -1) return res.status(404).send(renderPage('Not Found', `<h1>Appointment not found</h1>`));
    const appt = appointments[idx];

    const business = await readCollection('business', req.tenantId) || {};
    const googleReviewUrl = business.googleReviewUrl || '';

    appt.feedback = {
      rating,
      comment,
      createdAt: new Date().toISOString(),
      routedTo: rating >= 4 && googleReviewUrl ? 'google' : 'private'
    };
    await writeCollection('appointments', appointments, req.tenantId);

    // Save to feedback collection for admin view
    const feedback = await readCollection('feedback', req.tenantId) || [];
    feedback.push({
      id: 'fb-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      appointmentId: appt.id,
      customerName: appt.customerName,
      customerEmail: appt.customerEmail,
      serviceName: appt.serviceName,
      rating,
      comment,
      createdAt: new Date().toISOString(),
      routedTo: appt.feedback.routedTo
    });
    await writeCollection('feedback', feedback, req.tenantId);

    // Email owner on negative ratings so they can follow up personally
    if (rating <= 3) {
      const ownerEmail = business.email || process.env.BREVO_SMTP_USER;
      transporter.sendMail({
        from: `"${business.name || 'Salon'}" <${process.env.BREVO_SMTP_USER}>`,
        to: ownerEmail,
        subject: `⚠ Low rating (${rating}★) from ${appt.customerName}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:20px;">
            <h2 style="color:#b76e79;">Low rating received</h2>
            <p><strong>Customer:</strong> ${escapeHtml(appt.customerName)} (${escapeHtml(appt.customerEmail)})</p>
            <p><strong>Phone:</strong> ${escapeHtml(appt.customerPhone || 'N/A')}</p>
            <p><strong>Service:</strong> ${escapeHtml(appt.serviceName)}</p>
            <p><strong>Rating:</strong> ${rating}★</p>
            ${comment ? `<p><strong>Comment:</strong> ${escapeHtml(comment)}</p>` : ''}
            <p style="color:#666;font-size:13px;">Reach out personally to resolve this before they share publicly.</p>
          </div>
        `
      }).catch(err => console.error('[feedback] owner alert email failed:', err.message));
    }

    // Route the response
    if (rating >= 4 && googleReviewUrl) {
      return res.redirect(googleReviewUrl);
    }
    return res.redirect(`/feedback/${appt.id}/thanks`);
  } catch (err) {
    console.error('[feedback] POST error:', err);
    res.status(500).send(renderPage('Error', `<h1>Something went wrong</h1>`));
  }
});

// GET /feedback/:apptId/thanks
router.get('/:apptId/thanks', (req, res) => {
  res.send(renderPage('Thank you', `
    <h1>Thanks for sharing</h1>
    <p class="sub">We appreciate your honest feedback. Someone from our team will reach out personally to make sure we get it right next time.</p>
  `));
});

module.exports = router;
