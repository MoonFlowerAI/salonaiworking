const express = require('express');
const router = express.Router();
const { readCollection, writeCollection } = require('../db');

function formatTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function formatDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

// GET /cancel/:id — show confirmation page
router.get('/:id', async (req, res) => {
  try {
    const appointments = await readCollection('appointments', req.tenantId) || [];
    const appt = appointments.find(a => a.id === req.params.id);

    const business = await readCollection('business', req.tenantId) || {};
    const primary = (business.theme && business.theme.primary) || '#5B2C87';
    const name = business.name || 'Salon';

    if (!appt) {
      return res.send(page(name, primary, `<p style="text-align:center;color:#888;">Appointment not found.</p>`));
    }
    if (appt.status === 'cancelled') {
      return res.send(page(name, primary, `<p style="text-align:center;color:#888;">This appointment has already been cancelled.</p>`));
    }

    const details = `
      <p><strong>Service:</strong> ${appt.serviceName}</p>
      <p><strong>Date:</strong> ${formatDate(appt.date)}</p>
      <p><strong>Time:</strong> ${formatTime(appt.time)}</p>
      <p><strong>Duration:</strong> ${appt.duration} min</p>`;

    const body = `
      <h2 style="text-align:center;color:#333;">Cancel Appointment?</h2>
      <div style="background:#f9f5ff;border-radius:8px;padding:16px;margin:16px 0;">${details}</div>
      <form method="POST" action="/cancel/${appt.id}">
        <button type="submit" style="width:100%;padding:14px;background:${primary};color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer;">
          Yes, Cancel My Appointment
        </button>
      </form>
      <p style="text-align:center;margin-top:12px;"><a href="/" style="color:${primary};">Never mind, go back</a></p>`;

    res.send(page(name, primary, body));
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading appointment.');
  }
});

// POST /cancel/:id — perform the cancellation
router.post('/:id', async (req, res) => {
  try {
    const appointments = await readCollection('appointments', req.tenantId) || [];
    const index = appointments.findIndex(a => a.id === req.params.id);

    const business = await readCollection('business', req.tenantId) || {};
    const primary = (business.theme && business.theme.primary) || '#5B2C87';
    const name = business.name || 'Salon';

    if (index === -1) {
      return res.send(page(name, primary, `<p style="text-align:center;color:#888;">Appointment not found.</p>`));
    }
    if (appointments[index].status === 'cancelled') {
      return res.send(page(name, primary, `<p style="text-align:center;color:#888;">Already cancelled.</p>`));
    }

    appointments[index].status = 'cancelled';
    appointments[index].cancelledAt = new Date().toISOString();
    await writeCollection('appointments', appointments, req.tenantId);

    const body = `
      <h2 style="text-align:center;color:#333;">Appointment Cancelled</h2>
      <p style="text-align:center;color:#555;">Your appointment has been cancelled. We hope to see you again soon.</p>
      <div style="text-align:center;margin-top:20px;">
        <a href="/" style="padding:12px 28px;background:${primary};color:#fff;border-radius:8px;text-decoration:none;font-size:15px;">Book Again</a>
      </div>`;

    res.send(page(name, primary, body));
  } catch (err) {
    console.error(err);
    res.status(500).send('Error cancelling appointment.');
  }
});

function page(bizName, primary, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${bizName}</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f8; margin: 0; padding: 20px; }
    .card { max-width: 480px; margin: 60px auto; background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 4px 20px rgba(0,0,0,.08); }
    h1 { color: ${primary}; text-align: center; margin-bottom: 4px; }
    p { line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${bizName}</h1>
    ${body}
  </div>
</body>
</html>`;
}

module.exports = router;
