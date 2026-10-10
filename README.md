# JobHunt Tracker

A Chrome extension (Manifest V3) that saves job postings in one click and tracks your
applications through a full pipeline — no login, no account, everything stays in your browser.

## Why I built it

Applying to jobs across LinkedIn, Naukri, Wellfound, Internshala and a dozen other sites
means losing track in spreadsheets — where did I apply, what's the stage, when should I
follow up? JobHunt Tracker reduces that to **one click per job, or one click per whole
results page**.

## Features

- **One-click save** — popup auto-fills title, company, location from the open page
- **Bulk scan** — "Scan this page" saves every listing on a search results page at once
- **Pipeline tracking** — Saved → Applied → Screening → Interview → Offer / Rejected
- **Follow-up reminders** — notification when an application has no update in 7+ days
- **Search & filter**, **stats dashboard** (pipeline funnel, saved-per-day chart)
- **CSV export** — your data, anywhere
- **Optional cloud sync** — Node.js/Express/MongoDB backend for cross-device sync
  (passwordless device-token design; the extension works 100% without it)

## Supported sites (bulk scan)

**Verified working:** wellfound.com, internshala.com, linkedin.com, cutshort.io,
remote-work.app, jobfound.org, hiredoor.in, connectsblue.com

**Structurally verified:** naukri.com, mailermen.com, smartrecruiters.com, jobright.ai

**Needs testing (bot-protected):** indeed.com, instahyre.com, glassdoor, himalayas.app

Any other site falls back to a generic card detector, and single-save works everywhere.

## How it works (architecture)

- **Adapter pattern:** each site is a ~10-line config object (hostname regex + CSS
  selectors + parsers). One shared engine interprets them — adding a site means adding
  one object, zero engine changes.
- **On-demand injection:** the content script runs only when you click the extension
  (`activeTab` + `chrome.scripting`), never on every page load. Minimum permissions.
- **Idempotent injection:** ping-first `ensureContentScript()` + an IIFE load guard, so
  the script is injected at most once per page (this fixed a real double-injection crash
  found during testing).

## Install (use it)

1. Download the latest release ZIP and extract it.
2. Open `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** → select the extracted folder.
4. Click the toolbar icon on any job site.

## Develop (build it)

```bash
npm install
npm run build
```
## Privacy
No account, no tracking, no analytics. Job data is stored in chrome.storage.local
on your device only. The optional sync backend (self-hosted) sees only the jobs you
choose to sync. No data is sold or shared — there is nothing to sell.

## Roadmap
Adapter health checks (alert when a site redesign breaks its adapter)
Unit tests with saved HTML fixtures
Chrome Web Store release
