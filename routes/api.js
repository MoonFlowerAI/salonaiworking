const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { readCollection, writeCollection } = require('../db');
const stripeLib = require('../lib/stripe');
const { intakeLimiter, lookupLimiter, verifyTurnstile } = require('../lib/security');

// Send email via Brevo transactional API (no SMTP, works from any host)
async function brevoSend({ from, to, replyTo, subject, html, attachment }) {
  const fromMatch = from.match(/"?([^"<]*)"?\s*<([^>]+)>/);
  const sender = fromMatch
    ? { name: fromMatch[1].trim(), email: fromMatch[2].trim() }
    : { email: from };
  const body = {
    sender,
    to: [{ email: to }],
    subject,
    htmlContent: html,
  };
  if (replyTo) body.replyTo = { email: replyTo };
  if (attachment) body.attachment = attachment;
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo API ${res.status}: ${text}`);
  }
  return res.json();
}

function formatDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

async function sendAppointmentEmail(appointment, staff, tenantId) {
  const business = await readCollection('business', tenantId) || {};
  const dateStr = formatDate(appointment.date);
  const providerLabel = (business.terminology && business.terminology.provider) || 'Provider';
  const primaryColor = (business.theme && business.theme.primary) || '#b76e79';
  const darkColor = (business.theme && business.theme.dark) || '#1a1a2e';
  const creamColor = (business.theme && business.theme.cream) || '#faf3e0';

  const customerHtml = `
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:20px;background:${creamColor};border-radius:12px;">
      <h2 style="color:${primaryColor};text-align:center;">${business.name || 'Business'}</h2>
      <h3 style="text-align:center;color:#333;">Appointment Confirmed!</h3>
      <div style="background:white;border-radius:8px;padding:16px;margin:16px 0;">
        <p><strong>Service:</strong> ${appointment.serviceName}</p>
        <p><strong>Date:</strong> ${dateStr}</p>
        <p><strong>Time:</strong> ${appointment.time}</p>
        <p><strong>${providerLabel}:</strong> ${staff ? staff.name : 'TBD'}</p>
        <p><strong>Duration:</strong> ${appointment.duration} min</p>
        <p><strong>Total:</strong> $${appointment.price.toFixed(2)}</p>
        ${appointment.addOns.length ? `<p><strong>Add-ons:</strong> ${appointment.addOns.map(a => a.name).join(', ')}</p>` : ''}
        ${appointment.serviceAddress ? `<p><strong>Service address:</strong> ${appointment.serviceAddress}</p>` : ''}
      </div>
      <p style="text-align:center;color:#666;font-size:13px;">
        ${business.address || ''}<br>
        ${business.phone || ''}
      </p>
    </div>`;

  const ownerHtml = `
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:20px;background:${darkColor};color:${creamColor};border-radius:12px;">
      <h2 style="color:${primaryColor};text-align:center;">New Appointment Booked!</h2>
      <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:16px;margin:16px 0;">
        <p><strong>Customer:</strong> ${appointment.customerName}</p>
        <p><strong>Email:</strong> ${appointment.customerEmail}</p>
        <p><strong>Phone:</strong> ${appointment.customerPhone || 'N/A'}</p>
        <p><strong>Service:</strong> ${appointment.serviceName}</p>
        <p><strong>Date:</strong> ${dateStr}</p>
        <p><strong>Time:</strong> ${appointment.time}</p>
        <p><strong>${providerLabel}:</strong> ${staff ? staff.name : 'TBD'}</p>
        <p><strong>Total:</strong> $${appointment.price.toFixed(2)}</p>
        ${appointment.serviceAddress ? `<p><strong>Service address:</strong> ${appointment.serviceAddress}</p>` : ''}
        ${appointment.notes ? `<p><strong>Notes:</strong> ${appointment.notes}</p>` : ''}
      </div>
    </div>`;

  const ownerEmail = business.email || process.env.BREVO_SMTP_USER;

  try {
    await brevoSend({
      from: `"${business.name || 'Salon'}" <hello@moonflowerai.com>`,
      to: appointment.customerEmail,
      subject: `Appointment Confirmed - ${appointment.serviceName} on ${dateStr}`,
      html: customerHtml
    });
    await brevoSend({
      from: `"${business.name || 'Salon'}" <hello@moonflowerai.com>`,
      to: ownerEmail,
      subject: `New Booking: ${appointment.customerName} - ${appointment.serviceName}`,
      html: ownerHtml
    });
    console.log(`Emails sent for appointment ${appointment.id}`);
  } catch (err) {
    console.error('Email send error:', err.message, err.code, err.response);
  }
}

async function sendCancellationEmail(appointment, staff, tenantId) {
  const business = await readCollection('business', tenantId) || {};
  const dateStr = formatDate(appointment.date);
  const providerLabel = (business.terminology && business.terminology.provider) || 'Provider';
  const primaryColor = (business.theme && business.theme.primary) || '#b76e79';
  const darkColor = (business.theme && business.theme.dark) || '#1a1a2e';
  const creamColor = (business.theme && business.theme.cream) || '#faf3e0';

  const customerHtml = `
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:20px;background:${creamColor};border-radius:12px;">
      <h2 style="color:${primaryColor};text-align:center;">${business.name || 'Business'}</h2>
      <h3 style="text-align:center;color:#333;">Appointment Cancelled</h3>
      <div style="background:white;border-radius:8px;padding:16px;margin:16px 0;">
        <p>Your appointment has been cancelled. Details below for your records.</p>
        <p><strong>Service:</strong> ${appointment.serviceName}</p>
        <p><strong>Date:</strong> ${dateStr}</p>
        <p><strong>Time:</strong> ${appointment.time}</p>
        <p><strong>${providerLabel}:</strong> ${staff ? staff.name : 'TBD'}</p>
      </div>
      <p style="text-align:center;color:#666;font-size:13px;">
        Want to rebook? Visit us anytime.<br>
        ${business.phone || ''}
      </p>
    </div>`;

  const ownerHtml = `
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:20px;background:${darkColor};color:${creamColor};border-radius:12px;">
      <h2 style="color:${primaryColor};text-align:center;">Appointment Cancelled</h2>
      <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:16px;margin:16px 0;">
        <p><strong>Customer:</strong> ${appointment.customerName} (${appointment.customerEmail})</p>
        <p><strong>Service:</strong> ${appointment.serviceName}</p>
        <p><strong>Was scheduled for:</strong> ${dateStr} at ${appointment.time}</p>
        <p><strong>${providerLabel}:</strong> ${staff ? staff.name : 'TBD'}</p>
        <p><strong>Cancelled at:</strong> ${new Date(appointment.cancelledAt).toLocaleString('en-US')}</p>
      </div>
    </div>`;

  const ownerEmail = business.email || process.env.BREVO_SMTP_USER;

  try {
    await brevoSend({
      from: `"${business.name || 'Salon'}" <hello@moonflowerai.com>`,
      to: appointment.customerEmail,
      subject: `Appointment Cancelled - ${appointment.serviceName} on ${dateStr}`,
      html: customerHtml
    });
    await brevoSend({
      from: `"${business.name || 'Salon'}" <hello@moonflowerai.com>`,
      to: ownerEmail,
      subject: `Cancellation: ${appointment.customerName} - ${appointment.serviceName}`,
      html: ownerHtml
    });
    console.log(`Cancellation emails sent for appointment ${appointment.id}`);
  } catch (err) {
    console.error('Cancellation email error:', err.message, err.code, err.response);
  }
}

async function sendRescheduleEmail(appointment, staff, previousDate, previousTime, tenantId) {
  const business = await readCollection('business', tenantId) || {};
  const dateStr = formatDate(appointment.date);
  const prevDateStr = formatDate(previousDate);
  const providerLabel = (business.terminology && business.terminology.provider) || 'Provider';
  const primaryColor = (business.theme && business.theme.primary) || '#b76e79';
  const creamColor = (business.theme && business.theme.cream) || '#faf3e0';

  const customerHtml = `
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:20px;background:${creamColor};border-radius:12px;">
      <h2 style="color:${primaryColor};text-align:center;">${business.name || 'Business'}</h2>
      <h3 style="text-align:center;color:#333;">Appointment Rescheduled</h3>
      <div style="background:white;border-radius:8px;padding:16px;margin:16px 0;">
        <p><strong>Service:</strong> ${appointment.serviceName}</p>
        <p><strong>Previously:</strong> ${prevDateStr} at ${previousTime}</p>
        <p><strong>Now scheduled for:</strong> ${dateStr} at ${appointment.time}</p>
        <p><strong>${providerLabel}:</strong> ${staff ? staff.name : 'TBD'}</p>
      </div>
      <p style="text-align:center;color:#666;font-size:13px;">
        ${business.address || ''}<br>
        ${business.phone || ''}
      </p>
    </div>`;

  try {
    await brevoSend({
      from: `"${business.name || 'Salon'}" <hello@moonflowerai.com>`,
      to: appointment.customerEmail,
      subject: `Appointment Rescheduled - ${appointment.serviceName} now on ${dateStr}`,
      html: customerHtml
    });
    console.log(`Reschedule email sent for appointment ${appointment.id}`);
  } catch (err) {
    console.error('Reschedule email error:', err.message, err.code, err.response);
  }
}

// --------------- Time helpers ---------------

function parseTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function formatTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatDisplayTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

// --------------- Public data routes ---------------

router.get('/services', async (req, res) => {
  try {
    const services = await readCollection('services', req.tenantId);
    if (!services) return res.status(500).json({ error: 'Failed to load services' });
    res.json(services);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load services' });
  }
});

router.get('/staff', async (req, res) => {
  try {
    const staff = await readCollection('staff', req.tenantId);
    if (!staff) return res.status(500).json({ error: 'Failed to load staff' });
    res.json(staff);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load staff' });
  }
});

router.get('/business', async (req, res) => {
  try {
    const business = await readCollection('business', req.tenantId);
    if (!business) return res.status(500).json({ error: 'Failed to load business info' });
    res.json(business);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load business info' });
  }
});

router.get('/reviews', async (req, res) => {
  try {
    const reviews = await readCollection('reviews', req.tenantId);
    if (!reviews) return res.status(500).json({ error: 'Failed to load reviews' });
    res.json(reviews);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load reviews' });
  }
});

// --------------- Availability ---------------

router.get('/availability/:staffId/:date', async (req, res) => {
  try {
    const { staffId, date } = req.params;
    const serviceDuration = parseInt(req.query.duration) || 30;

    const staff = await readCollection('staff', req.tenantId);
    if (!staff) return res.status(500).json({ error: 'Failed to load staff' });

    const member = staff.find(s => s.id === staffId);
    if (!member) return res.status(404).json({ error: 'Staff member not found' });

    const dateObj = new Date(date + 'T00:00:00');
    const dayOfWeek = dateObj.getDay();
    if (!member.workDays.includes(dayOfWeek)) {
      return res.json({ staffId, date, slots: [], message: `${member.name} does not work on this day.` });
    }

    const workStart = parseTime(member.workHours.start);
    const workEnd = parseTime(member.workHours.end);
    const breakStart = parseTime(member.breakTime.start);
    const breakEnd = parseTime(member.breakTime.end);

    const appointments = await readCollection('appointments', req.tenantId) || [];
    const dayAppointments = appointments.filter(
      a => a.staffId === staffId && a.date === date && a.status !== 'cancelled'
    );

    const slots = [];
    for (let time = workStart; time + serviceDuration <= workEnd; time += 30) {
      const slotEnd = time + serviceDuration;
      if (time < breakEnd && slotEnd > breakStart) continue;
      const hasConflict = dayAppointments.some(appt => {
        const apptStart = parseTime(appt.time);
        const apptEnd = apptStart + appt.duration;
        return time < apptEnd && slotEnd > apptStart;
      });
      if (!hasConflict) {
        slots.push({ time: formatTime(time), displayTime: formatDisplayTime(time) });
      }
    }

    res.json({ staffId, date, slots });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to check availability' });
  }
});

// --------------- Appointments ---------------

router.post('/appointments', async (req, res) => {
  try {
    const { customerName, customerEmail, customerPhone, smsConsent, smsConsentAt, staffId, serviceId, date, time, duration, addOns, notes, serviceAddress } = req.body;

    if (!customerName || !customerEmail || !staffId || !serviceId || !date || !time) {
      return res.status(400).json({ error: 'Missing required fields: customerName, customerEmail, staffId, serviceId, date, time' });
    }

    const services = await readCollection('services', req.tenantId);
    const service = services ? services.find(s => s.id === serviceId) : null;
    if (!service) return res.status(400).json({ error: 'Invalid service ID' });

    // For at-customer services, require a service address.
    if (service.appointmentType === 'at-customer' && !serviceAddress) {
      return res.status(400).json({ error: 'This service happens at your location — please provide a service address.' });
    }

    const totalDuration = duration || service.duration;

    const appointments = await readCollection('appointments', req.tenantId) || [];
    const slotStart = parseTime(time);
    const slotEnd = slotStart + totalDuration;

    const conflict = appointments.find(a => {
      if (a.staffId !== staffId || a.date !== date || a.status === 'cancelled') return false;
      const aStart = parseTime(a.time);
      const aEnd = aStart + a.duration;
      return slotStart < aEnd && slotEnd > aStart;
    });

    if (conflict) {
      return res.status(409).json({ error: 'This time slot is already booked. Please choose another time.' });
    }

    let totalPrice = service.price;
    const selectedAddOns = [];
    if (addOns && Array.isArray(addOns)) {
      addOns.forEach(addOnName => {
        const found = service.addOns.find(a => a.name === addOnName);
        if (found) {
          totalPrice += found.price;
          selectedAddOns.push(found);
        }
      });
    }

    // TCPA: record the exact timestamp (and IP, best-effort) of SMS opt-in so
    // the salon has defensible proof if a customer ever disputes that they
    // consented to reminder texts. We only trust consent if a phone was given.
    const hasPhone = !!(customerPhone && String(customerPhone).trim());
    const consented = !!(hasPhone && smsConsent);
    const consentAt = consented ? (smsConsentAt || new Date().toISOString()) : null;
    const consentIp = consented
      ? (req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '').slice(0, 64)
      : null;

    const appointment = {
      id: 'apt-' + crypto.randomBytes(6).toString('hex'),
      customerName,
      customerEmail,
      customerPhone: customerPhone || '',
      smsConsent: consented,
      smsConsentAt: consentAt,
      smsConsentIp: consentIp,
      serviceAddress: serviceAddress || '',
      appointmentType: service.appointmentType || 'at-business',
      staffId,
      serviceId,
      serviceName: service.name,
      date,
      time,
      duration: totalDuration,
      price: totalPrice,
      addOns: selectedAddOns,
      notes: notes || '',
      status: 'confirmed',
      createdAt: new Date().toISOString()
    };

    // Deposit handling: if the service requires a deposit and Stripe is
    // configured, create a Checkout session and return its URL so the
    // frontend can redirect the customer to pay.
    let depositSessionUrl = null;
    if (service.requiresDeposit && stripeLib.isEnabled()) {
      const depositAmount = service.depositAmount || 20;
      const depositResult = await stripeLib.createDepositSession({
        appointmentId: appointment.id,
        amountCents: Math.round(depositAmount * 100),
        description: `Deposit for ${service.name}`,
        customerEmail: customerEmail,
        tenantId: req.tenantId
      });
      if (depositResult.url) {
        depositSessionUrl = depositResult.url;
        appointment.deposit = {
          status: 'pending',
          amount: Math.round(depositAmount * 100),
          currency: 'usd',
          stripeSessionId: depositResult.sessionId
        };
      }
    }

    appointments.push(appointment);
    await writeCollection('appointments', appointments, req.tenantId);

    const staffList = await readCollection('staff', req.tenantId) || [];
    const staffMember = staffList.find(s => s.id === staffId);
    sendAppointmentEmail(appointment, staffMember, req.tenantId); // fire and forget

    res.status(201).json({
      message: 'Appointment booked successfully!',
      appointment,
      depositSessionUrl
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save appointment' });
  }
});

router.get('/appointments/:email', lookupLimiter, async (req, res) => {
  try {
    const email = req.params.email.toLowerCase();
    const appointments = await readCollection('appointments', req.tenantId) || [];
    const userAppointments = appointments
      .filter(a => a.customerEmail.toLowerCase() === email)
      .sort((a, b) => new Date(b.date + 'T' + b.time) - new Date(a.date + 'T' + a.time));

    const staff = await readCollection('staff', req.tenantId) || [];
    const enriched = userAppointments.map(a => ({
      ...a,
      staffName: (staff.find(s => s.id === a.staffId) || {}).name || 'Unknown'
    }));

    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load appointments' });
  }
});

router.put('/appointments/:id/cancel', async (req, res) => {
  try {
    const appointments = await readCollection('appointments', req.tenantId) || [];
    const index = appointments.findIndex(a => a.id === req.params.id);

    if (index === -1) return res.status(404).json({ error: 'Appointment not found' });
    if (appointments[index].status === 'cancelled') {
      return res.status(400).json({ error: 'Appointment is already cancelled' });
    }

    appointments[index].status = 'cancelled';
    appointments[index].cancelledAt = new Date().toISOString();

    await writeCollection('appointments', appointments, req.tenantId);

    const staffList = await readCollection('staff', req.tenantId) || [];
    const staffMember = staffList.find(s => s.id === appointments[index].staffId);
    sendCancellationEmail(appointments[index], staffMember, req.tenantId); // fire and forget

    res.json({ message: 'Appointment cancelled successfully.', appointment: appointments[index] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

router.put('/appointments/:id/reschedule', async (req, res) => {
  try {
    const { date, time, staffId } = req.body;

    if (!date || !time) {
      return res.status(400).json({ error: 'New date and time are required' });
    }

    const appointments = await readCollection('appointments', req.tenantId) || [];
    const index = appointments.findIndex(a => a.id === req.params.id);

    if (index === -1) return res.status(404).json({ error: 'Appointment not found' });
    if (appointments[index].status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot reschedule a cancelled appointment' });
    }

    const appt = appointments[index];
    const targetStaff = staffId || appt.staffId;
    const slotStart = parseTime(time);
    const slotEnd = slotStart + appt.duration;

    const conflict = appointments.find(a => {
      if (a.id === appt.id || a.staffId !== targetStaff || a.date !== date || a.status === 'cancelled') return false;
      const aStart = parseTime(a.time);
      const aEnd = aStart + a.duration;
      return slotStart < aEnd && slotEnd > aStart;
    });

    if (conflict) {
      return res.status(409).json({ error: 'The new time slot is already booked.' });
    }

    const previousDate = appointments[index].date;
    const previousTime = appointments[index].time;

    appointments[index].date = date;
    appointments[index].time = time;
    if (staffId) appointments[index].staffId = staffId;
    appointments[index].rescheduledAt = new Date().toISOString();

    await writeCollection('appointments', appointments, req.tenantId);

    const staffList = await readCollection('staff', req.tenantId) || [];
    const staffMember = staffList.find(s => s.id === appointments[index].staffId);
    sendRescheduleEmail(appointments[index], staffMember, previousDate, previousTime, req.tenantId); // fire and forget

    res.json({ message: 'Appointment rescheduled successfully.', appointment: appointments[index] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

// Public gallery read
router.get('/gallery', async (req, res) => {
  try {
    const gallery = await readCollection('gallery', req.tenantId) || [];
    res.json(gallery);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load gallery' });
  }
});

// ─── Intake form submission ───────────────────────────────────────────────────


function buildIntakeEmail(d) {
  const row = (label, val) => {
    if (!val || (Array.isArray(val) && !val.length)) return '';
    const display = Array.isArray(val) ? val.join(', ') : String(val);
    return `<tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:6px 12px;font-size:13px;color:#1a1a2e">${display.replace(/\n/g,'<br>')}</td></tr>`;
  };
  const section = (title, rows) => {
    const content = rows.join('');
    if (!content) return '';
    return `<tr><td colspan="2" style="padding:14px 12px 4px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#5B2C87;border-top:1px solid #E8DFF5">${title}</td></tr>${content}`;
  };

  const stylists = [];
  for (let i = 1; i <= 6; i++) {
    if (d[`stylist${i}_name`]) {
      const specs = (d[`stylist${i}_specialties`] || []).join(', ');
      stylists.push(`${d[`stylist${i}_name`]} | ${d[`stylist${i}_title`] || ''} | ${specs} | ${d[`stylist${i}_exp`] || ''} | ${d[`stylist${i}_bio`] || ''}`);
    }
  }

  return `
  <div style="font-family:Arial,sans-serif;max-width:700px;margin:auto;background:#faf3e0;padding:24px;border-radius:12px">
    <h2 style="color:#5B2C87;margin:0 0 4px">New Salon Intake</h2>
    <p style="color:#6b7280;font-size:13px;margin:0 0 20px">Submitted ${new Date().toLocaleString('en-US',{timeZone:'America/New_York'})}</p>
    <table style="width:100%;border-collapse:collapse;background:white;border-radius:10px;overflow:hidden">
      ${section('A · The Basics', [row('Salon Name', d.salonName), row('Owner', d.ownerName), row('Email', d.ownerEmail), row('Phone', d.phone), row('Address', d.address), row('Instagram', d.instagram), row('Facebook', d.facebook), row('TikTok', d.tiktok), row('Existing Website', d.existingWebsite), row('Google Business', d.googleBusiness)])}
      ${section('B · Hours', [row('Schedule', d.hoursPreset === 'custom' ? 'Custom' : d.hoursPreset), ...(d.hoursPreset === 'custom' ? [row('Mon', d.monHours), row('Tue', d.tueHours), row('Wed', d.wedHours), row('Thu', d.thuHours), row('Fri', d.friHours), row('Sat', d.satHours), row('Sun', d.sunHours)] : []), row('Notes', d.hoursNotes)])}
      ${section('C · Services', [row('Hair Cuts', d.svc_haircuts), row('Color Services', d.svc_color), row('Treatments', d.svc_treatments), row('Styling', d.svc_styling), row('Extensions', d.svc_extensions), row('Custom Services', d.svcCustom), row('Discounts', d.discounts), row('Discount Details', d.discountDetails)])}
      ${section('D · Team', [row('Team Size', d.teamSize), ...stylists.map((s, i) => row(`Stylist ${i + 1}`, s)), row('Extra Stylists', d.extraStylists)])}
      ${section('E · Brand & Vibe', [row('Logo', d.logo), row('Brand Colors', d.brandColors), row('Hex Codes', d.hexCodes), row('Vibe', d.vibe), row('Tone', d.tone), row('Tagline', d.tagline), row('Inspired By', d.inspiredBy), row('Photo Folder', d.photoFolder)])}
      ${section('F · Policies', [row('Cancellation Notice', d.cancelNotice), row('No-Show Fee', d.noShowFee), row('Deposit', d.deposit), row('Deposit Amount', d.depositAmount), row('Children', d.children), row('Pets', d.pets), row('Walk-Ins', d.walkIns), row('Payment Methods', d.payment)])}
      ${section('G · AI Chatbot', [row('Bot Name', d.botName === 'Other' ? d.botNameCustom : d.botName), row('Bot Personality', d.botPersonality), row('Escalation', d.botEscalation)])}
      ${section('H · FAQ Library', [row('Selected FAQs', d.faqs), row('FAQ Overrides', d.faqOverrides), row('Custom FAQ 1', d.customFaq1q ? `Q: ${d.customFaq1q} / A: ${d.customFaq1a}` : ''), row('Custom FAQ 2', d.customFaq2q ? `Q: ${d.customFaq2q} / A: ${d.customFaq2a}` : ''), row('Extra FAQs', d.extraFaqs)])}
      ${section('I · Email & SMS', [row('Auto Flows', d.autoFlows), row('Referral Reward', d.referralReward), row('Birthday Discount', d.birthdayDiscount), row('Standing Promos', d.promos), row('SMS Window', d.smsWindow === 'Custom window (tell us below)' ? d.smsWindowCustom : d.smsWindow)])}
      ${section('J · Voice Bot', [row('Voice Bot', d.voiceBot), row('Voice Preference', d.voicePreference), row('Business Phone', d.businessPhone), row('Forward Phone', d.forwardPhone), row('Languages', d.voiceLang)])}
      ${section('K · What You Have', [row('Existing Accounts', d.existing), row('Current Software', d.currentSoftware)])}
      ${section('L · Goals', [row('Top Goal', d.goal1), row('Frustration', d.frustration), row('Success Vision', d.successVision), row('Anything Else', d.anythingElse)])}
    </table>
  </div>`;
}

router.post('/intake', intakeLimiter, async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;

  // Bot check: honeypot
  if (req.body._hp) return res.status(200).json({ ok: true }); // silently accept

  // Cloudflare Turnstile verification (when configured)
  const turnstile = await verifyTurnstile(req.body._turnstile, ip);
  if (!turnstile.ok) return res.status(403).json({ error: turnstile.error });

  // Basic required fields
  const { salonName, ownerName, ownerEmail, phone, address, tier } = req.body;
  if (!salonName || !ownerName || !ownerEmail || !phone || !address) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  try {
    const { pool } = require('../db');
    const safeData = { ...req.body, _hp: undefined };

    const slug = salonName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const dateStr = new Date().toISOString().slice(0, 10);
    const jsonContent = Buffer.from(JSON.stringify(safeData, null, 2)).toString('base64');

    await brevoSend({
      from: `"${ownerName} via MoonFlower AI" <hello@moonflowerai.com>`,
      to: 'hello@moonflowerai.com',
      replyTo: ownerEmail,
      subject: `New Lead: ${salonName} — ${ownerName} [${tier || 'basic'}]`,
      html: buildIntakeEmail(req.body),
      attachment: [{ name: `intake-${slug}-${dateStr}.txt`, content: jsonContent }],
    });

    let intakeId = null;
    if (pool) {
      const result = await pool.query(
        `INSERT INTO intakes (ip, salon_name, owner_name, owner_email, phone, data)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [ip, salonName, ownerName, ownerEmail, phone, JSON.stringify(safeData)]
      ).catch(err => { console.error('Intake DB save error:', err); return null; });
      intakeId = result && result.rows && result.rows[0] ? String(result.rows[0].id) : null;
    }

    // Create Stripe signup checkout session
    const validTier = ['basic', 'pro', 'premium'].includes(tier) ? tier : 'basic';
    let checkoutUrl = null;
    try {
      const stripeResult = await stripeLib.createSignupSession({ tier: validTier, salonName, ownerEmail, intakeId });
      if (stripeResult.enabled && stripeResult.url) checkoutUrl = stripeResult.url;
    } catch (stripeErr) {
      console.error('Stripe session error (non-fatal):', stripeErr.message);
    }

    res.json({ ok: true, checkoutUrl });
  } catch (err) {
    console.error('Intake email error:', err);
    res.status(500).json({ error: 'Failed to send. Please email hello@moonflowerai.com directly.' });
  }
});

module.exports = router;
