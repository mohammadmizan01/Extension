// JobHunt Tracker — background.js consent logic (replacement snippet)
//
// Replaces the existing chrome.runtime.onInstalled block in public/background.js.
// Opens the disclosure/consent page:
//   - on every fresh install, and
//   - on update IF the data practices changed (DATA_PRACTICES_VERSION bumped
//     and the user hasn't consented to that version).
// This satisfies the CWS Disclosure Requirements Policy (2026-08-01 enforcement):
// "all data collection prominently disclosed to the user" +
// "proactively disclose to users if data handling practices change after installation".

// Bump this ONLY when data practices genuinely change (new data type collected,
// new destination, new permission). Keep in sync with consent.html.
const DATA_PRACTICES_VERSION = 1;

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const data = await chrome.storage.local.get(['sites', 'jobs']);
    if (!data.sites) await chrome.storage.local.set({ sites: DEFAULT_SITES });
    if (!data.jobs) await chrome.storage.local.set({ jobs: [] });
    // Daily check for stale applications (follow-up nudge)
    chrome.alarms.create('followup-check', { periodInMinutes: 60 * 24 });

    // First-run disclosure + consent
    chrome.tabs.create({ url: chrome.runtime.getURL('consent.html') });
  }

  if (details.reason === 'update') {
    const { privacyConsent } = await chrome.storage.local.get('privacyConsent');
    if (!privacyConsent || privacyConsent.version !== DATA_PRACTICES_VERSION) {
      // Data practices changed since the user last consented — re-prompt
      // in "what changed" mode. Already-consented features keep working.
      chrome.tabs.create({
        url: chrome.runtime.getURL('consent.html?changed=1'),
      });
    }
  }
});
