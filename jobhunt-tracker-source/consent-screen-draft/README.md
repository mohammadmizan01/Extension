# Consent screen draft — JobHunt Tracker (Chrome Web Store 2026 disclosure rules)

**Why:** Chrome's CWS policy updates (announced 2026-07-01, enforced from 2026-08-01) now
require that **all data collection be prominently disclosed to the user** and that developers
**proactively disclose any change in data-handling practices after install**.
Source: https://developer.chrome.com/blog/cws-policy-updates-2026

**Current state:** v0.8.0 has no first-run consent/disclosure screen (verified against
`src/popup/App.jsx` and `public/background.js`). This draft closes that gap so the
extension is submittable without a disclosure-policy rejection.

**Files in this draft:**

| File | Install |
|---|---|
| `consent.html` | Copy to `public/consent.html` (Vite copies `public/` verbatim; `npm run build` picks it up with no config change). |
| `background-snippet.js` | Merge the `DATA_PRACTICES_VERSION` logic into the existing `chrome.runtime.onInstalled` block in `public/background.js` (snippet contains the full replacement block). |
| `listing-copy.md` | Paste into the Developer Dashboard: single-purpose description, permission justifications, and Privacy-practices answers. Keep these three (consent page, listing, dashboard declarations) saying the same thing — reviewers cross-check. |

**Test flow (after copying files):**

1. `npm run build`, load the `dist/` folder unpacked in Chrome.
2. On fresh install the consent page should open in a new tab automatically.
3. Click **"Agree & start tracking"** → tab closes, popup opens normally.
4. Reinstall fresh, click **Decline** → the extension refuses to save jobs and points to `chrome://extensions` to remove it.
5. Re-consent test: bump `DATA_PRACTICES_VERSION` from 1 → 2, reload the unpacked extension (counts as an update) → consent page re-opens in "what changed" mode.

**Rules of this consent page:**

- One click to accept, plain language, no dark patterns.
- Local-first story stays true: nothing leaves the browser unless the user sets up cloud sync in Settings (verified: sync requires manual register/link in `src/lib/sync.js`).
- Only bump `DATA_PRACTICES_VERSION` when data practices genuinely change — re-prompting on a bug fix trains users to click through.

**Not included (manual, before submission):** add a Privacy Policy URL page, support URL,
trader/non-trader declaration, $5 developer registration, and 2-step verification —
all owner-side steps in the Developer Dashboard.
