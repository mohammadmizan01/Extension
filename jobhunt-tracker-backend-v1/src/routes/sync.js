const express = require('express');
const Job = require('../models/Job');

const router = express.Router();

const FIELDS = [
  'title', 'company', 'location', 'site', 'url', 'status',
  'posterName', 'posterUrl', 'companyUrl', 'contactEmail', 'ceoName', 'notes',
  'clientCreatedAt', 'clientUpdatedAt',
];

function pick(body) {
  const out = {};
  for (const f of FIELDS) {
    if (body[f] !== undefined) out[f] = body[f];
  }
  return out;
}

// POST /api/sync/push  (auth)  { jobs: [...] } → { upserted }
// Last-write-wins on clientUpdatedAt. Tombstones (deleted: true) propagate deletes.
router.post('/push', async (req, res) => {
  const jobs = Array.isArray(req.body?.jobs) ? req.body.jobs.slice(0, 500) : [];
  let upserted = 0;
  for (const j of jobs) {
    if (!j || !j.clientId) continue;
    const data = pick(j);
    data.syncKeyHash = req.device.syncKeyHash;
    data.clientId = String(j.clientId).slice(0, 120);
    if (typeof j.deleted === 'boolean') data.deleted = j.deleted;

    const existing = await Job.findOne({ syncKeyHash: data.syncKeyHash, clientId: data.clientId });
    const incomingTs = data.clientUpdatedAt ? new Date(data.clientUpdatedAt).getTime() : 0;
    const existingTs = existing?.clientUpdatedAt ? new Date(existing.clientUpdatedAt).getTime() : 0;

    if (!existing || incomingTs >= existingTs) {
      await Job.findOneAndUpdate(
        { syncKeyHash: data.syncKeyHash, clientId: data.clientId },
        { $set: data },
        { upsert: true }
      );
      upserted++;
    }
  }
  res.json({ upserted });
});

// GET /api/sync/pull?since=ISO  (auth) → { jobs, serverTime }
// Returns jobs changed since `since` (or all). Tombstones included so the
// client can delete locally.
router.get('/pull', async (req, res) => {
  const since = req.query.since ? new Date(req.query.since) : new Date(0);
  const docs = await Job.find({
    syncKeyHash: req.device.syncKeyHash,
    updatedAt: { $gt: isNaN(since.getTime()) ? new Date(0) : since },
  })
    .sort({ updatedAt: 1 })
    .limit(1000)
    .lean();

  res.json({
    serverTime: new Date().toISOString(),
    jobs: docs.map((d) => ({
      clientId: d.clientId,
      ...Object.fromEntries(FIELDS.map((f) => [f, d[f] ?? ''])),
      deleted: !!d.deleted,
      updatedAt: d.updatedAt,
    })),
  });
});

module.exports = router;
