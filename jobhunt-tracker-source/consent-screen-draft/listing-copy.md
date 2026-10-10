# Developer Dashboard copy — JobHunt Tracker (CWS 2026-ready)

Paste-ready text for the Store listing + Privacy practices tabs.
Keep consent.html, this listing, and the dashboard declarations saying the same thing — reviewers cross-check all three.

---

## Store listing

**Single purpose (required field):**
> Save job postings in one click and track your application pipeline from Saved to Applied, Screening, Interview, Offer, or Rejected — all inside your browser.

**Description (suggested):**
> JobHunt Tracker is a job-application tracker for your browser. On any job page, click Save to capture the title, company, location, and link; on search results pages, click Scan to collect listings in bulk. A dashboard tracks each application's status, reminds you to follow up on stale applications, and exports everything to CSV.
>
> No account, no signup. Everything is stored locally in your browser by default; optional cloud sync (which you set up yourself with your own sync key) keeps multiple devices in sync.
>
> Privacy: the extension only reads pages you explicitly scan or save from, never crawls in the background, and never sells or shares your data.

---

## Permission justifications (Dashboard → Privacy practices)

| Permission | Justification |
|---|---|
| `storage` | Persists the jobs you save, your status changes, notes, and settings in Chrome local storage. Core to the tracker's single purpose. |
| `activeTab` | Grants temporary access to the tab you click Scan/Save on, so the content script can read the job listing you chose. |
| `scripting` | Injects the content script into that tab to extract the job card details (title, company, URL) you asked to save. |
| Optional host permissions (sites you add) | Lets the scanner read job listings on the custom websites you define in Settings. The extension never visits these sites on its own — only when you open them and click Scan. |
| `alarms` | Runs a daily check for applications with no update in 7+ days so we can remind you to follow up. |
| `notifications` | Displays that follow-up reminder. Nothing else. |

---

## Privacy practices answers (suggested)

- **Data collected:** job posting details the user saves (title, company, location, URL, status, notes, optional contact fields), the user's custom website list, and — only if the user enables cloud sync — the same data plus sync credentials, sent to a server the user configures.
- **Data use:** storing and displaying the user's tracked applications; optional sync only.
- **Data not collected:** browsing history, passwords, emails, page content the user didn't ask to save.
- **Data sharing:** none. No third parties, no ads, no analytics.
- **Data practices change policy:** the in-app consent screen re-appears on update whenever data handling changes (versioned consent, `privacyConsent` record in local storage).

---

## Review-risk notes

- Broad optional host permissions (`<all_urls>` pattern via custom site list) trigger closer review in 2026. Narrowing is favorable, but the user-defined site list is the product's design — keep the justification above verbatim and make sure no code touches pages without the user clicking Scan/Save.
- All executable logic must ship in the package (MV3: no remote code). The bundled React build is compliant; the optional sync backend only receives data, never code.
