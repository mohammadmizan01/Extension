const mongoose = require('mongoose');

// One document per linked browser/device.
// Identity is password-less: the user links devices with a sync key shown
// in the extension. The sync key itself is only used at link time; every
// device then gets its own revocable device token for normal API calls.
const deviceSchema = new mongoose.Schema(
  {
    // sha256(syncKey) — groups devices that belong to the same user
    syncKeyHash: { type: String, required: true, index: true },
    // sha256(deviceToken) — bearer credential for API calls
    tokenHash: { type: String, required: true, unique: true },
    name: { type: String, default: '' }, // e.g. "Chrome — office laptop"
    revoked: { type: Boolean, default: false },
    lastSeenAt: { type: Date, default: null },
  },
  { timestamps: true }
);

deviceSchema.index({ syncKeyHash: 1, revoked: 1 });

module.exports = mongoose.model('Device', deviceSchema);
