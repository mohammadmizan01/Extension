const mongoose = require('mongoose');

// Mirrors the extension's job fields, plus sync bookkeeping.
// Deletes are tombstones (deleted: true) so they propagate to other devices.
const jobSchema = new mongoose.Schema(
  {
    syncKeyHash: { type: String, required: true, index: true },
    clientId: { type: String, required: true }, // extension-generated job.id
    title: { type: String, default: '' },
    company: { type: String, default: '' },
    location: { type: String, default: '' },
    site: { type: String, default: '' },
    url: { type: String, default: '' },
    status: {
      type: String,
      default: 'saved',
      enum: ['saved', 'applied', 'screening', 'interview', 'offer', 'rejected'],
    },
    posterName: { type: String, default: '' },
    posterUrl: { type: String, default: '' },
    companyUrl: { type: String, default: '' },
    contactEmail: { type: String, default: '' },
    ceoName: { type: String, default: '' },
    notes: { type: String, default: '' },
    clientCreatedAt: { type: Date, default: null },
    clientUpdatedAt: { type: Date, default: null }, // drives last-write-wins
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

jobSchema.index({ syncKeyHash: 1, clientId: 1 }, { unique: true });
jobSchema.index({ syncKeyHash: 1, updatedAt: 1 });

module.exports = mongoose.model('Job', jobSchema);
