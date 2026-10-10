// JobHunt Tracker — sync client (Phase 2)
// Password-less: one sync key per user, one revocable device token per browser.
// No accounts, no passwords. Server never sees anything besides saved jobs.

import { getJobsRaw, saveJob, updateJob, deleteJob } from './storage.js';

const SYNC_KEY = 'sync';

export async function getSyncSettings() {
  const data = await chrome.storage.local.get(SYNC_KEY);
  return data[SYNC_KEY] || { backendUrl: '', deviceToken: '', syncKey: '', lastSyncAt: null };
}

export async function setSyncSettings(patch) {
  const cur = await getSyncSettings();
  const next = { ...cur, ...patch };
  await chrome.storage.local.set({ [SYNC_KEY]: next });
  return next;
}

function baseUrl(settings) {
  return (settings.backendUrl || '').replace(/\/+$/, '');
}

// Official MV3 pattern: cross-origin fetch from extension pages needs a host
// permission. The backend URL is user-typed, so we request that exact origin
// at runtime (declared via optional_host_permissions in the manifest).
async function ensureOriginPermission(backendUrl) {
  const origin = `${backendUrl.replace(/\/+$/, '')}/*`;
  try {
    const has = await chrome.permissions.contains({ origins: [origin] });
    if (has) return true;
    const granted = await chrome.permissions.request({ origins: [origin] });
    if (!granted) throw new Error('Backend ki permission deny ho gayi — sync ke liye allow karo.');
    return true;
  } catch (e) {
    if (e.message && e.message.includes('deny')) throw e;
    // permissions API unavailable — continue; fetch will fail loudly if blocked
    return true;
  }
}

async function api(settings, path, { method = 'GET', body } = {}) {
  const res = await fetch(baseUrl(settings) + path, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${settings.deviceToken}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `request failed (${res.status})`);
  return json;
}

// First device: creates the sync-key group. Returns { syncKey, deviceToken }.
export async function registerDevice(backendUrl, name) {
  const base = backendUrl.replace(/\/+$/, '');
  await ensureOriginPermission(base);
  const res = await fetch(`${base}/api/devices/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'registration failed');
  await setSyncSettings({ backendUrl: base, deviceToken: json.deviceToken, syncKey: json.syncKey, lastSyncAt: null });
  return json;
}

// Other devices: link with the sync key shown on the first device.
export async function linkDevice(backendUrl, syncKey, name) {
  const base = backendUrl.replace(/\/+$/, '');
  await ensureOriginPermission(base);
  const res = await fetch(`${base}/api/devices/link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ syncKey: syncKey.trim(), name }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'linking failed');
  await setSyncSettings({ backendUrl: base, deviceToken: json.deviceToken, syncKey: syncKey.trim(), lastSyncAt: null });
  return json;
}

function toTs(iso) {
  const t = iso ? new Date(iso).getTime() : 0;
  return isNaN(t) ? 0 : t;
}

// Full sync: push local → pull remote → merge (last-write-wins) → tombstones.
export async function fullSync(onProgress) {
  const settings = await getSyncSettings();
  if (!settings.backendUrl || !settings.deviceToken) {
    throw new Error('Sync is not set up yet.');
  }
  await ensureOriginPermission(baseUrl(settings));
  const step = (m) => onProgress && onProgress(m);

  step('Pushing local jobs…');
  const localJobs = await getJobsRaw();
  const payload = localJobs.map((j) => ({
    clientId: j.id,
    title: j.title, company: j.company, location: j.location, site: j.site, url: j.url,
    status: j.status, posterName: j.posterName, posterUrl: j.posterUrl, companyUrl: j.companyUrl,
    contactEmail: j.contactEmail, ceoName: j.ceoName, notes: j.notes,
    clientCreatedAt: j.createdAt, clientUpdatedAt: j.updatedAt,
  }));
  await api(settings, '/api/sync/push', { method: 'POST', body: { jobs: payload } });

  step('Pulling changes…');
  const since = settings.lastSyncAt || new Date(0).toISOString();
  const { jobs: remote, serverTime } = await api(settings, `/api/sync/pull?since=${encodeURIComponent(since)}`);

  step('Merging…');
  const localById = new Map(localJobs.map((j) => [j.id, j]));
  let applied = 0;
  for (const r of remote || []) {
    const local = localById.get(r.clientId);
    if (r.deleted) {
      if (local) {
        await deleteJob(local.id);
        applied++;
      }
      continue;
    }
    if (!local) {
      await saveJob({
        id: r.clientId,
        title: r.title, company: r.company, location: r.location, site: r.site, url: r.url,
        status: r.status, posterName: r.posterName, posterUrl: r.posterUrl, companyUrl: r.companyUrl,
        contactEmail: r.contactEmail, ceoName: r.ceoName, notes: r.notes,
      });
      applied++;
    } else if (toTs(r.clientUpdatedAt) > toTs(local.updatedAt)) {
      await updateJob(local.id, {
        title: r.title, company: r.company, location: r.location, site: r.site, url: r.url,
        status: r.status, posterName: r.posterName, posterUrl: r.posterUrl, companyUrl: r.companyUrl,
        contactEmail: r.contactEmail, ceoName: r.ceoName, notes: r.notes,
      });
      applied++;
    }
  }

  await setSyncSettings({ lastSyncAt: serverTime || new Date().toISOString() });
  return { pushed: payload.length, applied };
}

export async function listDevices() {
  const settings = await getSyncSettings();
  if (!settings.deviceToken) throw new Error('Sync is not set up yet.');
  return api(settings, '/api/devices');
}

export async function revokeDevice(id) {
  const settings = await getSyncSettings();
  if (!settings.deviceToken) throw new Error('Sync is not set up yet.');
  return api(settings, `/api/devices/${id}/revoke`, { method: 'POST', body: {} });
}
