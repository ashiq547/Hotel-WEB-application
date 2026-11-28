const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const hotelRoutes = require('./routes/hotelRoutes');
const roomRoutes = require('./routes/roomRoutes');
const guestRoutes = require('./routes/guestRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const reservationRoutes = require('./routes/reservationRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const billRoutes = require('./routes/billRoutes');
const reportRoutes = require('./routes/reportRoutes');
const userRoutes = require('./routes/userRoutes');

const app = express();
const PORT = process.env.PORT || 5000;
const API_ENDPOINTS = [
  ['POST', '/api/auth/login', 'Staff login'],
  ['POST', '/api/auth/guest-login', 'Guest login'],
  ['POST', '/api/auth/refresh', 'Rotate refresh session and issue an access token'],
  ['POST', '/api/auth/logout', 'Revoke the current refresh session'],
  ['GET', '/api/auth/sessions', 'List the current user sessions'],
  ['GET / POST', '/api/hotels', 'List hotels or create a hotel'],
  ['GET / PUT / DELETE', '/api/hotels/:id', 'Read or manage a hotel; owner-only actions are enforced'],
  ['GET / POST / DELETE', '/api/hotels/:id/members', 'View or manage hotel membership'],
  ['GET / POST / PUT / DELETE', '/api/rooms', 'Browse and manage rooms'],
  ['GET / POST / PUT / DELETE', '/api/reservations', 'Browse and manage reservations'],
  ['GET / POST / PUT / DELETE', '/api/services', 'Browse and manage services'],
  ['GET / POST', '/api/services/records', 'Read or assign guest services'],
  ['GET / POST / PUT / DELETE', '/api/guests', 'Register guests and manage guest records'],
  ['GET / POST / PUT / DELETE', '/api/employees', 'Manage employee records'],
  ['GET', '/api/bills', 'Read bills'],
  ['GET', '/api/reports', 'Read reports'],
  ['GET / PUT / POST / DELETE', '/api/users', 'Admin user management, roles, bans, logs, moderation, and exports']
];
const allowedOrigins = (process.env.FRONTEND_ORIGINS || (
  process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000'
))
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Middleware
app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.includes(origin));
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date(), message: 'Hotel Management System Backend API is active' });
});

app.get('/api/docs', (req, res) => {
  const rows = API_ENDPOINTS.map(([method, path, description]) =>
    `<tr><td><code>${method}</code></td><td><code>${path}</code></td><td>${description}</td></tr>`
  ).join('');
  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Hotel Management API</title>
  <style>
    body{font:16px/1.5 system-ui,sans-serif;max-width:1100px;margin:40px auto;padding:0 20px;color:#17202a}
    h1{margin-bottom:4px}p{color:#536273}table{width:100%;border-collapse:collapse;margin-top:24px}
    th,td{text-align:left;padding:12px;border-bottom:1px solid #dfe5eb}th{background:#f2f5f8}
    code{font:13px ui-monospace,monospace}
  </style>
</head>
<body>
  <h1>Hotel Management API</h1>
  <p>API base path: <code>/api</code>. Protected routes require a Bearer access token.</p>
  <p>Access tokens expire within 15 minutes. Refresh tokens are HTTP-only cookies; role and ownership permissions are checked server-side.</p>
  <table>
    <thead><tr><th>Method</th><th>Endpoint</th><th>Description</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`);
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/hotels', hotelRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/guests', guestRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/users', userRoutes);

// Error Handler
app.use(errorHandler);

// Start Server with keep-alive socket timeout configuration to prevent Vite proxy socket hangup
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  const server = app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(` Hotel Management API Server running on port ${PORT}`);
    console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(` MySQL Host: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '3306'}`);
    console.log(`=======================================================`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`=======================================================`);
      console.warn(` ⚠️  Port ${PORT} is already in use by a running process.`);
      console.warn(` An existing backend server is already active on port ${PORT}.`);
      console.warn(`=======================================================`);
      process.exit(1);
    }
  });

  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
}

module.exports = app;
