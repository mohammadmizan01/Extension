const crypto = require('crypto');
const Device = require('../models/Device');

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

// Bearer device-token auth. The sync key itself is never accepted here —
// only per-device tokens issued at register/link time.
async function deviceAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: 'missing bearer token' });

  const tokenHash = sha256(m[1].trim());
  const device = await Device.findOne({ tokenHash, revoked: false });
  if (!device) return res.status(401).json({ error: 'invalid or revoked token' });

  device.lastSeenAt = new Date();
  await device.save().catch(() => {});
  req.device = device;
  next();
}

module.exports = { deviceAuth, sha256 };
