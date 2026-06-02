const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { readCollection, writeCollection } = require('../db');
const { DEFAULT_TENANT } = require('../lib/tenant');

const JWT_SECRET = process.env.JWT_SECRET || 'salon-dev-secret-change-me';

function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    // Enforce tenant match: a JWT issued for tenant X cannot operate on tenant Y.
    const tokenTenant = decoded.tenantId || DEFAULT_TENANT;
    const currentTenant = req.tenantId || DEFAULT_TENANT;
    if (tokenTenant !== currentTenant) {
      return res.status(403).json({ error: 'Admin token not valid for this tenant' });
    }
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

router.use(adminAuth);

// GET /api/admin/appointments
router.get('/appointments', async (req, res) => {
  try {
    const { date, staffId, status } = req.query;
    let appointments = await readCollection('appointments', req.tenantId) || [];
    const staff = await readCollection('staff', req.tenantId) || [];

    if (date) appointments = appointments.filter(a => a.date === date);
    if (staffId) appointments = appointments.filter(a => a.staffId === staffId);
    if (status) appointments = appointments.filter(a => a.status === status);

    appointments.sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      return a.time.localeCompare(b.time);
    });

    const enriched = appointments.map(a => ({
      ...a,
      staffName: (staff.find(s => s.id === a.staffId) || {}).name || 'Unknown'
    }));

    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load appointments' });
  }
});

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const appointments = await readCollection('appointments', req.tenantId) || [];
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - mondayOffset);
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const monthStartStr = todayStr.slice(0, 7) + '-01';

    const active = appointments.filter(a => a.status !== 'cancelled');

    const bookingsToday = active.filter(a => a.date === todayStr).length;
    const bookingsWeek = active.filter(a => a.date >= weekStartStr && a.date <= todayStr).length;
    const bookingsMonth = active.filter(a => a.date >= monthStartStr && a.date <= todayStr).length;

    const revenueToday = active.filter(a => a.date === todayStr).reduce((sum, a) => sum + (a.price || 0), 0);
    const revenueWeek = active.filter(a => a.date >= weekStartStr && a.date <= todayStr).reduce((sum, a) => sum + (a.price || 0), 0);
    const revenueMonth = active.filter(a => a.date >= monthStartStr && a.date <= todayStr).reduce((sum, a) => sum + (a.price || 0), 0);

    const serviceCounts = {};
    active.forEach(a => {
      const name = a.serviceName || 'Unknown';
      serviceCounts[name] = (serviceCounts[name] || 0) + 1;
    });
    const popularServices = Object.entries(serviceCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const staff = await readCollection('staff', req.tenantId) || [];
    const staffStats = staff.map(s => {
      const staffAppts = active.filter(a => a.staffId === s.id);
      return {
        id: s.id,
        name: s.name,
        totalBookings: staffAppts.length,
        revenue: staffAppts.reduce((sum, a) => sum + (a.price || 0), 0)
      };
    });

    res.json({
      bookings: { today: bookingsToday, week: bookingsWeek, month: bookingsMonth },
      revenue: { today: revenueToday, week: revenueWeek, month: revenueMonth },
      popularServices,
      staffStats,
      totalAppointments: active.length,
      cancelledAppointments: appointments.filter(a => a.status === 'cancelled').length
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// PUT /api/admin/services (replace entire collection)
router.put('/services', async (req, res) => {
  try {
    const services = req.body;
    if (!Array.isArray(services)) {
      return res.status(400).json({ error: 'Services must be an array' });
    }
    await writeCollection('services', services, req.tenantId);
    res.json({ message: 'Services updated successfully', count: services.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update services' });
  }
});

// POST /api/admin/services (create one)
router.post('/services', async (req, res) => {
  try {
    const {
      name, category, description, duration, price, addOns,
      requiresDeposit, depositAmount,
      pricingModel, hourlyRate,
      appointmentType
    } = req.body;
    if (!name || !duration || price == null) {
      return res.status(400).json({ error: 'name, duration, and price are required' });
    }
    const services = await readCollection('services', req.tenantId) || [];
    const newService = {
      id: 'svc-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      category: category || 'General',
      description: description || '',
      duration: Number(duration),
      price: Number(price),
      addOns: Array.isArray(addOns) ? addOns : [],
      requiresDeposit: !!requiresDeposit,
      depositAmount: depositAmount != null ? Number(depositAmount) : 0,
      pricingModel: pricingModel === 'hourly' ? 'hourly' : 'fixed',
      hourlyRate: hourlyRate != null ? Number(hourlyRate) : 0,
      appointmentType: ['at-customer', 'either'].includes(appointmentType) ? appointmentType : 'at-business'
    };
    services.push(newService);
    await writeCollection('services', services, req.tenantId);
    res.status(201).json({ message: 'Service created', service: newService });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create service' });
  }
});

// DELETE /api/admin/services/:id
router.delete('/services/:id', async (req, res) => {
  try {
    const services = await readCollection('services', req.tenantId) || [];
    const index = services.findIndex(s => s.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Service not found' });
    const [removed] = services.splice(index, 1);
    await writeCollection('services', services, req.tenantId);
    res.json({ message: 'Service deleted', service: removed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete service' });
  }
});

// PATCH /api/admin/services/:id (partial update)
router.patch('/services/:id', async (req, res) => {
  try {
    const services = await readCollection('services', req.tenantId) || [];
    const index = services.findIndex(s => s.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Service not found' });
    const { id, ...updates } = req.body;
    services[index] = { ...services[index], ...updates };
    await writeCollection('services', services, req.tenantId);
    res.json({ message: 'Service updated', service: services[index] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update service' });
  }
});

// PUT /api/admin/staff/:id
router.put('/staff/:id', async (req, res) => {
  try {
    const staff = await readCollection('staff', req.tenantId) || [];
    const index = staff.findIndex(s => s.id === req.params.id);

    if (index === -1) return res.status(404).json({ error: 'Staff member not found' });

    const { id, ...updates } = req.body;
    staff[index] = { ...staff[index], ...updates };

    await writeCollection('staff', staff, req.tenantId);
    res.json({ message: 'Staff member updated successfully', staff: staff[index] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update staff' });
  }
});

// POST /api/admin/staff (create one)
router.post('/staff', async (req, res) => {
  try {
    const { name, role, specialties, avatar, workDays, workHours, breakTime } = req.body;
    if (!name || !role) {
      return res.status(400).json({ error: 'name and role are required' });
    }
    const staff = await readCollection('staff', req.tenantId) || [];
    const newStaff = {
      id: 'staff-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      role,
      specialties: Array.isArray(specialties) ? specialties : [],
      avatar: avatar || '👤',
      workDays: Array.isArray(workDays) ? workDays : [1, 2, 3, 4, 5],
      workHours: workHours || { start: '09:00', end: '17:00' },
      breakTime: breakTime || { start: '12:00', end: '13:00' }
    };
    staff.push(newStaff);
    await writeCollection('staff', staff, req.tenantId);
    res.status(201).json({ message: 'Staff created', staff: newStaff });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create staff' });
  }
});

// DELETE /api/admin/staff/:id
router.delete('/staff/:id', async (req, res) => {
  try {
    const staff = await readCollection('staff', req.tenantId) || [];
    const index = staff.findIndex(s => s.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Staff not found' });
    const [removed] = staff.splice(index, 1);
    await writeCollection('staff', staff, req.tenantId);
    res.json({ message: 'Staff deleted', staff: removed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete staff' });
  }
});

// GET /api/admin/gallery
router.get('/gallery', async (req, res) => {
  try {
    const gallery = await readCollection('gallery', req.tenantId) || [];
    res.json(gallery);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load gallery' });
  }
});

// POST /api/admin/gallery (add an image)
router.post('/gallery', async (req, res) => {
  try {
    const { url, caption, category } = req.body;
    if (!url) return res.status(400).json({ error: 'url is required' });
    const gallery = await readCollection('gallery', req.tenantId) || [];
    const item = {
      id: 'img-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      url,
      caption: caption || '',
      category: category || 'General',
      createdAt: new Date().toISOString()
    };
    gallery.push(item);
    await writeCollection('gallery', gallery, req.tenantId);
    res.status(201).json({ message: 'Image added', item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add image' });
  }
});

// DELETE /api/admin/gallery/:id
router.delete('/gallery/:id', async (req, res) => {
  try {
    const gallery = await readCollection('gallery', req.tenantId) || [];
    const index = gallery.findIndex(i => i.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Image not found' });
    const [removed] = gallery.splice(index, 1);
    await writeCollection('gallery', gallery, req.tenantId);
    res.json({ message: 'Image deleted', item: removed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

// GET /api/admin/customers
router.get('/customers', async (req, res) => {
  try {
    const appointments = await readCollection('appointments', req.tenantId) || [];
    const customerNotes = await readCollection('customerNotes', req.tenantId) || {};

    const map = new Map();
    for (const a of appointments) {
      const key = (a.customerEmail || '').toLowerCase();
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, {
          email: a.customerEmail,
          name: a.customerName,
          phone: a.customerPhone || '',
          totalVisits: 0,
          completedVisits: 0,
          cancelledVisits: 0,
          totalSpent: 0,
          lastVisit: null,
          note: customerNotes[key] || ''
        });
      }
      const c = map.get(key);
      c.totalVisits += 1;
      if (a.status === 'cancelled') {
        c.cancelledVisits += 1;
      } else {
        c.completedVisits += 1;
        c.totalSpent += a.price || 0;
      }
      const when = `${a.date} ${a.time}`;
      if (!c.lastVisit || when > c.lastVisit) c.lastVisit = when;
      if (a.customerName) c.name = a.customerName;
      if (a.customerPhone) c.phone = a.customerPhone;
    }

    const customers = Array.from(map.values()).sort((a, b) => (b.lastVisit || '').localeCompare(a.lastVisit || ''));
    res.json(customers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load customers' });
  }
});

// GET /api/admin/customers/:email
router.get('/customers/:email', async (req, res) => {
  try {
    const email = req.params.email.toLowerCase();
    const appointments = await readCollection('appointments', req.tenantId) || [];
    const staff = await readCollection('staff', req.tenantId) || [];
    const customerNotes = await readCollection('customerNotes', req.tenantId) || {};
    const staffMap = Object.fromEntries(staff.map(s => [s.id, s.name]));

    const history = appointments
      .filter(a => (a.customerEmail || '').toLowerCase() === email)
      .sort((a, b) => (b.date + ' ' + b.time).localeCompare(a.date + ' ' + a.time))
      .map(a => ({ ...a, staffName: staffMap[a.staffId] || 'Unknown' }));

    if (history.length === 0) return res.status(404).json({ error: 'Customer not found' });

    const first = history[0];
    const totalSpent = history.filter(h => h.status !== 'cancelled').reduce((s, a) => s + (a.price || 0), 0);

    res.json({
      email: first.customerEmail,
      name: first.customerName,
      phone: first.customerPhone,
      totalVisits: history.length,
      completedVisits: history.filter(h => h.status !== 'cancelled').length,
      cancelledVisits: history.filter(h => h.status === 'cancelled').length,
      totalSpent,
      note: customerNotes[email] || '',
      history
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load customer' });
  }
});

// PUT /api/admin/customers/:email/note
router.put('/customers/:email/note', async (req, res) => {
  try {
    const email = req.params.email.toLowerCase();
    const { note } = req.body || {};
    const customerNotes = await readCollection('customerNotes', req.tenantId) || {};
    customerNotes[email] = (note || '').slice(0, 4000);
    await writeCollection('customerNotes', customerNotes, req.tenantId);
    res.json({ message: 'Note saved', note: customerNotes[email] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save note' });
  }
});

// PUT /api/admin/business (partial update of business config)
router.put('/business', async (req, res) => {
  try {
    const current = await readCollection('business', req.tenantId) || {};
    const incoming = req.body || {};
    const merged = {
      ...current,
      ...incoming,
      terminology: { ...(current.terminology || {}), ...(incoming.terminology || {}) },
      theme: { ...(current.theme || {}), ...(incoming.theme || {}) },
      social: { ...(current.social || {}), ...(incoming.social || {}) },
      hours: { ...(current.hours || {}), ...(incoming.hours || {}) }
    };
    if (Array.isArray(incoming.categories)) merged.categories = incoming.categories;
    await writeCollection('business', merged, req.tenantId);
    res.json({ message: 'Business config updated', business: merged });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update business config' });
  }
});

// GET /api/admin/feedback
router.get('/feedback', async (req, res) => {
  try {
    const feedback = await readCollection('feedback', req.tenantId) || [];
    const sorted = [...feedback].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    res.json(sorted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load feedback' });
  }
});

// GET /api/admin/export/appointments.csv
router.get('/export/appointments.csv', async (req, res) => {
  try {
    const appointments = await readCollection('appointments', req.tenantId) || [];
    const staff = await readCollection('staff', req.tenantId) || [];
    const staffMap = Object.fromEntries(staff.map(s => [s.id, s.name]));

    const headers = [
      'id', 'date', 'time', 'customerName', 'customerEmail', 'customerPhone',
      'staffName', 'serviceName', 'duration', 'price', 'status', 'notes', 'createdAt'
    ];
    const escape = (v) => {
      if (v == null) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const rows = appointments.map(a => [
      a.id, a.date, a.time, a.customerName, a.customerEmail, a.customerPhone || '',
      staffMap[a.staffId] || '', a.serviceName, a.duration, a.price, a.status,
      a.notes || '', a.createdAt || ''
    ].map(escape).join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="appointments-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to export appointments' });
  }
});

module.exports = router;
