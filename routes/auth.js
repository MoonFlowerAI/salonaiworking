const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { readCollection, writeCollection } = require('../db');
const { DEFAULT_TENANT } = require('../lib/tenant');

const JWT_SECRET = process.env.JWT_SECRET || 'salon-dev-secret-change-me';

function generateToken(user, tenantId) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: tenantId || DEFAULT_TENANT },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const users = await readCollection('users', req.tenantId) || [];

    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = {
      id: 'user-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      email: email.toLowerCase(),
      phone: phone || '',
      password: hashedPassword,
      role: 'customer',
      createdAt: new Date().toISOString()
    };

    users.push(user);
    await writeCollection('users', users, req.tenantId);

    const token = generateToken(user, req.tenantId);
    const { password: _, ...safeUser } = user;

    res.status(201).json({ message: 'Account created successfully!', token, user: safeUser });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const users = await readCollection('users', req.tenantId) || [];
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user, req.tenantId);
    const { password: _, ...safeUser } = user;

    res.json({ message: 'Login successful!', token, user: safeUser });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Enforce tenant match: the JWT must be for this tenant
    const tokenTenant = decoded.tenantId || DEFAULT_TENANT;
    const currentTenant = req.tenantId || DEFAULT_TENANT;
    if (tokenTenant !== currentTenant) {
      return res.status(401).json({ error: 'Token not valid for this tenant' });
    }
    const users = await readCollection('users', req.tenantId) || [];
    const user = users.find(u => u.id === decoded.id);

    if (!user) return res.status(404).json({ error: 'User not found' });

    const { password, ...safeUser } = user;
    res.json(safeUser);
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

module.exports = router;
