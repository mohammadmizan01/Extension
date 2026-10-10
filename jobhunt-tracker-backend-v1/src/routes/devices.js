const express = require('express');
const { nanoid } = require('nanoid');
const Device = require('../models/Device');
const { sha256 } = require('../middleware/auth');

const router = express.Router();

// POST /api/devices/register  { name } → { syncKey, deviceToken }
// First device: creates a new sync-key group. The syncKey is shown ONCE.
router.post('/register', async (req, res) => {
  const syncKey = `jh_${nanoid(24)}`;
  const deviceToken = `jhd_${nanoid(32)}`;
  const device = await Device.create({
    syncKeyHash: sha256(syncKey),
    tokenHash: sha256(deviceToken),
    name: String(req.body?.name || '').slice(0, 80),
  });
  res.status(201).json({
    syncKey, // show once — store in the extension
    deviceToken, // store in the extension, used as Bearer token
    deviceId: device._id,
  });
});

// POST /api/devices/link  { syncKey, name } → { deviceToken }
// Additional device: user types the sync key shown on the first device.
router.post('/link', async (req, res) => {
  const { syncKey, name } = req.body || {};
  if (!syncKey) return res.status(400).json({ error: 'syncKey required' });
  const syncKeyHash = sha256(String(syncKey).trim());
  const existing = await Device.findOne({ syncKeyHash, revoked: false });
  if (!existing) return res.status(404).json({ error: 'unknown sync key' });

  const deviceToken = `jhd_${nanoid(32)}`;
  const device = await Device.create({
    syncKeyHash,
    tokenHash: sha256(deviceToken),
    name: String(name || '').slice(0, 80),
  });
  res.status(201).json({ deviceToken, deviceId: device._id });
});

// GET /api/devices  (auth) → list devices in my group (token hashes never exposed)
router.get('/', async (req, res) => {
  const devices = await Device.find({ syncKeyHash: req.device.syncKeyHash })
    .select('_id name revoked lastSeenAt createdAt')
    .sort({ createdAt: 1 });
  res.json({
    devices: devices.map((d) => ({
      id: d._id,
      name: d.name,
      revoked: d.revoked,
      lastSeenAt: d.lastSeenAt,
      createdAt: d.createdAt,
      current: String(d._id) === String(req.device._id),
    })),
  });
});

// POST /api/devices/:id/revoke  (auth) → revoke a device token
router.post('/:id/revoke', async (req, res) => {
  const target = await Device.findOne({ _id: req.params.id, syncKeyHash: req.device.syncKeyHash });
  if (!target) return res.status(404).json({ error: 'device not found' });
  if (String(target._id) === String(req.device._id)) {
    return res.status(400).json({ error: 'cannot revoke the calling device' });
  }
  target.revoked = true;
  await target.save();
  res.json({ ok: true });
});

module.exports = router;
