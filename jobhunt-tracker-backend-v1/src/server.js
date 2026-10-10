const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { deviceAuth } = require('./middleware/auth');
const deviceRoutes = require('./routes/devices');
const syncRoutes = require('./routes/sync');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Basic abuse protection
app.use(
  '/api/',
  rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false })
);

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Device register/link are public (sync-key gated); everything else needs a device token.
app.use('/api/devices', (req, res, next) => {
  if ((req.path === '/register' || req.path === '/link') && req.method === 'POST') return next();
  return deviceAuth(req, res, next);
});
app.use('/api/devices', deviceRoutes);
app.use('/api/sync', deviceAuth, syncRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal error' });
});

const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jobhunt-tracker';

if (require.main === module) {
  mongoose
    .connect(MONGODB_URI)
    .then(() => {
      console.log('MongoDB connected');
      app.listen(PORT, () => console.log(`JobHunt Tracker API on :${PORT}`));
    })
    .catch((e) => {
      console.error('MongoDB connection failed:', e.message);
      process.exit(1);
    });
}

module.exports = app;
