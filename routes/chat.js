const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { readCollection, writeCollection } = require('../db');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

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

// --- Tool definitions for Claude ---
const tools = [
  {
    name: 'check_availability',
    description: 'Check available time slots for a specific staff member on a given date. Use this when a customer wants to book or asks about availability.',
    input_schema: {
      type: 'object',
      properties: {
        staff_name: { type: 'string', description: 'Name of the staff member (e.g. "Sophia Martinez")' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
        service_name: { type: 'string', description: 'Name of the service to check duration for' }
      },
      required: ['staff_name', 'date']
    }
  },
  {
    name: 'book_appointment',
    description: 'Book an appointment for a customer. Use this when the customer has confirmed they want to book with a specific staff member, service, date, and time. You MUST have the customer name and email before booking.',
    input_schema: {
      type: 'object',
      properties: {
        customer_name: { type: 'string', description: 'Full name of the customer' },
        customer_email: { type: 'string', description: 'Email address of the customer' },
        customer_phone: { type: 'string', description: 'Phone number (optional)' },
        staff_name: { type: 'string', description: 'Name of the staff member' },
        service_name: { type: 'string', description: 'Name of the service' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
        time: { type: 'string', description: 'Time in HH:MM format (24-hour)' },
        notes: { type: 'string', description: 'Any special requests or notes' }
      },
      required: ['customer_name', 'customer_email', 'staff_name', 'service_name', 'date', 'time']
    }
  }
];

// --- Async tool execution ---
async function executeCheckAvailability({ staff_name, date, service_name }, tenantId) {
  const staff = await readCollection('staff', tenantId) || [];
  const services = await readCollection('services', tenantId) || [];

  const member = staff.find(s => s.name.toLowerCase().includes(staff_name.toLowerCase()));
  if (!member) return { error: `Staff member "${staff_name}" not found. Available staff: ${staff.map(s => s.name).join(', ')}` };

  const service = service_name ? services.find(s => s.name.toLowerCase() === service_name.toLowerCase()) : null;
  const duration = service ? service.duration : 30;

  const dateObj = new Date(date + 'T00:00:00');
  const dayOfWeek = dateObj.getDay();
  if (!member.workDays.includes(dayOfWeek)) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const workDayNames = member.workDays.map(d => days[d]).join(', ');
    return { error: `${member.name} does not work on ${days[dayOfWeek]}. They work on: ${workDayNames}` };
  }

  const workStart = parseTime(member.workHours.start);
  const workEnd = parseTime(member.workHours.end);
  const breakStart = parseTime(member.breakTime.start);
  const breakEnd = parseTime(member.breakTime.end);

  const appointments = await readCollection('appointments', tenantId) || [];
  const dayAppointments = appointments.filter(
    a => a.staffId === member.id && a.date === date && a.status !== 'cancelled'
  );

  const slots = [];
  for (let time = workStart; time + duration <= workEnd; time += 30) {
    const slotEnd = time + duration;
    if (time < breakEnd && slotEnd > breakStart) continue;
    const hasConflict = dayAppointments.some(appt => {
      const apptStart = parseTime(appt.time);
      const apptEnd = apptStart + appt.duration;
      return time < apptEnd && slotEnd > apptStart;
    });
    if (!hasConflict) slots.push(formatDisplayTime(time));
  }

  return {
    staff: member.name,
    date,
    service: service ? `${service.name} ($${service.price}, ${service.duration} min)` : 'Not specified',
    available_slots: slots.length > 0 ? slots : 'No available slots on this date'
  };
}

async function executeBookAppointment({ customer_name, customer_email, customer_phone, staff_name, service_name, date, time, notes }, tenantId) {
  const staff = await readCollection('staff', tenantId) || [];
  const services = await readCollection('services', tenantId) || [];
  const appointments = await readCollection('appointments', tenantId) || [];

  const member = staff.find(s => s.name.toLowerCase().includes(staff_name.toLowerCase()));
  if (!member) return { error: `Staff member "${staff_name}" not found.` };

  const service = services.find(s => s.name.toLowerCase() === service_name.toLowerCase());
  if (!service) return { error: `Service "${service_name}" not found. Available services: ${services.map(s => s.name).join(', ')}` };

  const slotStart = parseTime(time);
  const slotEnd = slotStart + service.duration;

  const conflict = appointments.find(a => {
    if (a.staffId !== member.id || a.date !== date || a.status === 'cancelled') return false;
    const aStart = parseTime(a.time);
    const aEnd = aStart + a.duration;
    return slotStart < aEnd && slotEnd > aStart;
  });

  if (conflict) return { error: 'This time slot is already booked. Please choose another time.' };

  const appointment = {
    id: 'apt-' + crypto.randomBytes(6).toString('hex'),
    customerName: customer_name,
    customerEmail: customer_email,
    customerPhone: customer_phone || '',
    staffId: member.id,
    serviceId: service.id,
    serviceName: service.name,
    date,
    time,
    duration: service.duration,
    price: service.price,
    addOns: [],
    notes: notes || '',
    status: 'confirmed',
    createdAt: new Date().toISOString()
  };

  appointments.push(appointment);
  await writeCollection('appointments', appointments, tenantId);

  const dateStr = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return {
    success: true,
    message: 'Appointment booked successfully!',
    details: {
      id: appointment.id,
      customer: customer_name,
      service: service.name,
      stylist: member.name,
      date: dateStr,
      time: formatDisplayTime(slotStart),
      duration: `${service.duration} min`,
      price: `$${service.price}`
    }
  };
}

async function executeTool(name, input, tenantId) {
  switch (name) {
    case 'check_availability': return executeCheckAvailability(input, tenantId);
    case 'book_appointment': return executeBookAppointment(input, tenantId);
    default: return { error: `Unknown tool: ${name}` };
  }
}

// --- System prompt ---
async function buildSystemPrompt(tenantId) {
  const business = await readCollection('business', tenantId) || {};
  const services = await readCollection('services', tenantId) || [];
  const staff = await readCollection('staff', tenantId) || [];
  const reviews = await readCollection('reviews', tenantId) || [];

  const servicesByCategory = {};
  services.forEach(s => {
    if (!servicesByCategory[s.category]) servicesByCategory[s.category] = [];
    servicesByCategory[s.category].push(`${s.name} ($${s.price}, ${s.duration} min)`);
  });

  const servicesText = Object.entries(servicesByCategory)
    .map(([cat, items]) => `  ${cat}: ${items.join(', ')}`)
    .join('\n');

  const staffText = staff
    .map(s => {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const workDayNames = s.workDays.map(d => days[d]).join(', ');
      return `  - ${s.name} (${s.role}) — Specialties: ${s.specialties.join(', ')} — Works: ${workDayNames}, ${s.workHours.start}-${s.workHours.end}`;
    })
    .join('\n');

  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : 'N/A';

  const today = new Date().toISOString().split('T')[0];

  return `You are the friendly and professional virtual assistant for ${business.name || 'Salon & Spa'}. ${business.tagline || ''}

Today's date is ${today}.

BUSINESS INFO:
- Address: ${business.address || 'N/A'}
- Phone: ${business.phone || 'N/A'}
- Email: ${business.email || 'N/A'}
- Hours: Mon-Fri ${(business.hours || {})['mon-fri'] || 'N/A'}, Sat ${(business.hours || {}).sat || 'N/A'}, Sun ${(business.hours || {}).sun || 'Closed'}
- Average Rating: ${avgRating}/5 (${reviews.length} reviews)

SERVICES & PRICING:
${servicesText}

OUR TEAM:
${staffText}

BOOKING INSTRUCTIONS:
- You CAN directly book appointments using the book_appointment tool
- Before booking, always check availability first using check_availability
- You need the customer's name and email to book. If they haven't provided these, ask for them
- If the customer says "tomorrow", calculate the actual date from today (${today})
- When a customer asks to schedule, check availability first, then offer the slots, then book once they confirm

RESPONSE STYLE — THIS IS CRITICAL:
- Be SHORT and direct. Max 2-3 sentences per response
- Never repeat the address, phone, or business name unless specifically asked
- After booking, just confirm: service, stylist, date/time, price. Nothing else
- Do NOT add "feel free to call us" or "if you need anything" filler
- Do NOT use markdown headers or bullet lists for simple confirmations
- Example good booking confirmation: "Booked! Haircut with Sophia, Wed Mar 25 at 3 PM. $55, 45 min."
- Never make up information about services or pricing not listed above`;
}

// --- Chat endpoint with tool use loop ---
router.post('/', async (req, res) => {
  try {
    const { messages, user } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    if (!ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Anthropic API key not configured' });
    }

    let systemPrompt = await buildSystemPrompt(req.tenantId);
    if (user && user.name) {
      systemPrompt += `\n\nCURRENT CUSTOMER (logged in):\n- Name: ${user.name}\n- Email: ${user.email || 'Not provided'}\n- Phone: ${user.phone || 'Not provided'}\nYou already have their details — no need to ask for name/email when booking.`;
    }

    const formattedMessages = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    }));

    let currentMessages = [...formattedMessages];
    let maxIterations = 5;

    while (maxIterations-- > 0) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          system: systemPrompt,
          messages: currentMessages,
          tools
        })
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('Anthropic API error:', response.status, errorBody);
        return res.status(502).json({ error: 'Failed to get response from assistant' });
      }

      const data = await response.json();

      if (data.stop_reason === 'end_turn') {
        const textBlock = data.content.find(b => b.type === 'text');
        const reply = textBlock?.text || 'I apologize, I was unable to generate a response.';
        return res.json({ reply });
      }

      if (data.stop_reason === 'tool_use') {
        currentMessages.push({ role: 'assistant', content: data.content });

        const toolResults = [];
        for (const block of data.content) {
          if (block.type === 'tool_use') {
            console.log(`Tool call: ${block.name}`, JSON.stringify(block.input));
            const result = await executeTool(block.name, block.input, req.tenantId);
            console.log(`Tool result:`, JSON.stringify(result));
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result)
            });
          }
        }

        currentMessages.push({ role: 'user', content: toolResults });
        continue;
      }

      const textBlock = data.content.find(b => b.type === 'text');
      return res.json({ reply: textBlock?.text || 'I apologize, something went wrong.' });
    }

    return res.json({ reply: 'I apologize, I took too long processing your request. Please try again.' });

  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Chat service unavailable' });
  }
});

module.exports = router;
