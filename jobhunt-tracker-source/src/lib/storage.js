// JobHunt Tracker — storage layer (chrome.storage.local, no login needed)

const JOBS_KEY = 'jobs';
const SITES_KEY = 'sites';

export const STATUSES = [
  'saved',
  'applied',
  'screening',
  'interview',
  'offer',
  'rejected',
];

export const STATUS_LABELS = {
  saved: 'Saved',
  applied: 'Applied',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
};

async function getAll(key, fallback) {
  const data = await chrome.storage.local.get(key);
  return data[key] ?? fallback;
}

export async function getJobs() {
  const jobs = await getAll(JOBS_KEY, []);
  return jobs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

// Unsorted raw list — used by sync so push order is stable.
export async function getJobsRaw() {
  return getAll(JOBS_KEY, []);
}

export async function saveJob({ id, title, company, location, url, site, notes = '', posterName = '', posterUrl = '', companyUrl = '', contactEmail = '', ceoName = '' }) {
  const jobs = await getAll(JOBS_KEY, []);
  const now = new Date().toISOString();
  const job = {
    id: id || `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: title || 'Untitled role',
    company: company || '',
    location: location || '',
    url: url || '',
    site: site || '',
    status: 'saved',
    notes,
    // Enrichment fields — filled from the page when available, else manual.
    // Never auto-guessed or invented.
    posterName,
    posterUrl,
    companyUrl,
    contactEmail,
    ceoName,
    createdAt: now,
    updatedAt: now,
  };
  jobs.push(job);
  await chrome.storage.local.set({ [JOBS_KEY]: jobs });
  return job;
}

export async function updateJob(id, patch) {
  const jobs = await getAll(JOBS_KEY, []);
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx === -1) return null;
  jobs[idx] = { ...jobs[idx], ...patch, updatedAt: new Date().toISOString() };
  await chrome.storage.local.set({ [JOBS_KEY]: jobs });
  return jobs[idx];
}

export async function deleteJob(id) {
  const jobs = await getAll(JOBS_KEY, []);
  await chrome.storage.local.set({ [JOBS_KEY]: jobs.filter((j) => j.id !== id) });
}

export async function getSites() {
  return getAll(SITES_KEY, []);
}

export async function setSites(sites) {
  await chrome.storage.local.set({ [SITES_KEY]: sites });
}
