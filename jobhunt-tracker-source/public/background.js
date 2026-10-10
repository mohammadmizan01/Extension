// JobHunt Tracker — background service worker (Manifest V3)
// Responsibilities: initialise storage, relay messages, follow-up reminders.

const DEFAULT_SITES = [];

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const data = await chrome.storage.local.get(['sites', 'jobs']);
    if (!data.sites) await chrome.storage.local.set({ sites: DEFAULT_SITES });
    if (!data.jobs) await chrome.storage.local.set({ jobs: [] });
    // Daily check for stale applications (follow-up nudge)
    chrome.alarms.create('followup-check', { periodInMinutes: 60 * 24 });
  }
});

// Follow-up reminder: any application with no update in 7+ days
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'followup-check') return;
  const { jobs = [] } = await chrome.storage.local.get('jobs');
  const now = Date.now();
  const stale = jobs.filter(
    (j) =>
      ['applied', 'screening', 'interview'].includes(j.status) &&
      now - new Date(j.updatedAt).getTime() > 7 * 24 * 60 * 60 * 1000
  );
  if (stale.length > 0) {
    chrome.notifications?.create?.({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'JobHunt Tracker',
      message: `${stale.length} application(s) need a follow-up — no update in 7+ days.`,
    });
  }
});

// Open dashboard when the user clicks the notification or asks via message
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'OPEN_DASHBOARD') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
  }
  return true;
});
