// JobHunt Tracker — content script
// Runs only when the user clicks the extension (via chrome.scripting, activeTab).
// Two modes:
//   EXTRACT_JOB — single job detail page → one job object
//   SCAN_PAGE   — listing/search results page → array of job objects (bulk)
// Only reads what is already rendered on the page. No automation, no guessing.

// Self-guard: the popup injects this file on open (prefill) and again on every
// scan click. A second top-level run would throw "Identifier 'SITE_ADAPTERS'
// has already been declared", so everything lives in this IIFE and any repeat
// run exits early (the first run's message listener keeps working).
(() => {
if (window.__jobhuntTrackerLoaded) return;
window.__jobhuntTrackerLoaded = true;

function pickText(root, selectors) {
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    if (el && el.innerText && el.innerText.trim()) return el.innerText.trim();
  }
  return '';
}

// Adapter selectors may be a single CSS string or an array of fallbacks.
function asArray(s) {
  return Array.isArray(s) ? s : [s];
}

function getMeta(name) {
  const el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
  return el ? (el.getAttribute('content') || '').trim() : '';
}

function cleanUrl(href) {
  try {
    const u = new URL(href, window.location.href);
    // Strip tracking params for stable dedupe
    ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'refId', 'trackingId'].forEach((p) =>
      u.searchParams.delete(p)
    );
    return u.href;
  } catch {
    return href;
  }
}

// Pull an email out of visible page text (e.g. "send resume to hr@x.com").
// Returns '' when none is present — never invents one.
function findEmailOnPage() {
  const text = document.body ? document.body.innerText || '' : '';
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : '';
}

function extractJob() {
  const title = (
    getMeta('og:title') ||
    pickText(document, ['h1']) ||
    document.title
  ).slice(0, 200);

  const company = pickText(document, ['[data-company]', '.company', '[class*="company"]']).slice(0, 120);
  const location = pickText(document, ['[class*="location"]']).slice(0, 120);

  // Poster info when the page shows it (e.g. "Posted by <name>")
  const posterEl = document.querySelector('a[href*="/in/"], a[href*="linkedin.com/in"]');
  const posterName = posterEl ? (posterEl.innerText || '').trim().slice(0, 120) : '';
  const posterUrl = posterEl ? cleanUrl(posterEl.getAttribute('href')) : '';

  return {
    title,
    company,
    location,
    url: window.location.href,
    site: window.location.hostname.replace(/^www\./, ''),
    posterName,
    posterUrl,
    contactEmail: findEmailOnPage(),
  };
}

// Site-specific adapters: hostname pattern → selectors tuned to that site's markup.
// The generic CARD_SELECTORS below remain the fallback for everything else.
// To support a new site, add one entry here — no other file changes needed.
const SITE_ADAPTERS = [
  {
    // Wellfound — two listing layouts (verified 2026-10-10 via live DOM):
    // /jobs pages: card = div.mb-2, company = div.text-sm > span:first-child
    //   ("Acme • "), meta = span.text-gray-700 ("Remote • $70k – $80k • today").
    // /role/* pages: card = div.w-full.pb-1 (one job each; the div.mb-4 section
    //   groups several jobs), company = h2 in the section's startup-header
    //   (div.mb-6 ancestor), meta = span.pl-1.text-xs items (salary, location…).
    match: /(^|\.)wellfound\.com$/,
    titleLinks: 'a[href^="/jobs/"]',
    ignoreHref: /\/signup/,
    cardFrom: (link) => link.closest('div.mb-2, div.w-full.pb-1, div.min-h-\\[50px\\]'),
    companyFrom: (link, card) => {
      const textOf = (el) => (el ? (el.innerText || el.textContent || '').trim() : '');
      const inCard = textOf(card.querySelector('div.text-sm > span:first-child'));
      if (inCard) return inCard.split('•')[0].trim();
      const section = link.closest('div.mb-6');
      const h2 = section && section.querySelector('[data-testid="startup-header"] h2');
      return textOf(h2);
    },
    locationSelAll: ['span.text-gray-700', 'span.pl-1.text-xs'],
    companyLinkSel: 'a[href^="/company/"]',
    parseCompany: (raw) => raw.split('•')[0].trim(),
    parseLocation: (raw) =>
      raw
        .split('•')
        .map((s) => s.trim())
        .filter((s) => s && !/[$₹€£%]|equity|today|yesterday|\bago\b|\byears?\b/i.test(s))
        .join(' • '),
  },
  {
    // LinkedIn public job search (linkedin.com/jobs/*).
    // Card: .job-search-card (a <div> with an overlay link, or an <a> itself).
    match: /(^|\.)linkedin\.com$/,
    cards: '.job-search-card',
    linkSel: 'a.base-card__full-link',
    linkIsCard: true, // some cards ARE the <a>
    titleSel: '.base-search-card__title',
    companySel: '.base-search-card__subtitle',
    locationSel: '.job-search-card__location',
  },
  {
    // Naukri (naukri.com job search).
    // Card: div.srp-jobtuple-wrapper[data-job-id]; title link a.title is the detail link.
    match: /(^|\.)naukri\.com$/,
    cards: 'div.srp-jobtuple-wrapper',
    linkSel: '.row1 h2 a.title',
    titleSel: '.row1 h2 a.title',
    companySel: 'a.comp-name',
    locationSel: '.locWdth',
  },
  {
    // Indeed (indeed.com/jobs).
    // Title links: a.jcs-JobTitle (data-jk = stable job key). Card: div.tapItem.
    // Detail hrefs are redirect URLs, so build the canonical viewjob URL from data-jk.
    match: /(^|\.)indeed\.com$/,
    titleLinks: 'a.jcs-JobTitle',
    cardAncestor: 'div.tapItem',
    companySel: '[class*="company-info"]',
    urlFrom: (link) => {
      const jk = link.getAttribute('data-jk');
      if (jk) return 'https://www.indeed.com/viewjob?jk=' + encodeURIComponent(jk);
      const href = link.getAttribute('href');
      if (href && href !== '#') return cleanUrl(href);
      return '';
    },
  },
  {
    // Internshala (internshala.com/jobs/*).
    // Title link: a.job-title-href (href /job/detail/{slug}-{id}); one per card.
    // Company/location render as plain text near the card — selectors are best-effort.
    match: /(^|\.)internshala\.com$/,
    titleLinks: 'a.job-title-href',
    cardFrom: (link) =>
      link.closest('div.individual_internship') ||
      (link.closest('h2.job-internship-name') || {}).parentElement ||
      null,
    companySel: '.company-name, h4',
    locationSel: '#location_names, [id*="location"]',
  },
  {
    // Cutshort (cutshort.io job search / SEO listing pages).
    // Styled-components classes: use [class*="..."] partial hooks, never full hashes.
    // Title link: a[href*="/job/"] (detail URL /job/<slug>-<8-char-id>).
    match: /(^|\.)cutshort\.io$/,
    titleLinks: 'a[href*="/job/"]',
    cardAncestor: 'div[class*="sc-3010035d-0"]',
    companySel: 'a[href*="/company/"]',
    companyLinkSel: 'a[href*="/company/"]',
    locationSel: '[class*="sc-3010035d-26"]',
  },
  {
    // Instahyre (instahyre.com/search-jobs).
    // Card: div.employer-block. Note: class "company-name" is reused for the
    // title h2 AND the company div — selectors are scoped by parent to disambiguate.
    match: /(^|\.)instahyre\.com$/,
    cards: 'div.employer-block',
    linkSel: 'a[href*="/job-"]',
    titleSel: 'div.employer-job-name > h2.company-name',
    companySel: 'div.employer-company-name > div.company-name',
    locationSel: 'div.employer-locations span.ng-binding',
  },
  {
    // Glassdoor (glassdoor.co.in / glassdoor.com job search).
    // CSS-module hashes change per build — key off data-test attributes.
    match: /(^|\.)glassdoor\.(co\.in|com)$/,
    cards: 'li[data-test="jobListing"]',
    linkSel: 'a[data-test="job-title"]',
    titleSel: 'a[data-test="job-title"]',
    companySel: '[class*="compactEmployerName"]',
    locationSel: '[data-test="emp-location"]',
  },
  {
    // SmartRecruiters (jobs.smartrecruiters.com/* — incl. company career pages).
    // The card IS the link: a.job. Company = first li in ul.job-details.
    match: /(^|\.)smartrecruiters\.com$/,
    cards: 'a.job',
    linkIsCard: true,
    titleSel: 'h3.job-title',
    companySel: 'ul.job-details > li:first-child',
    locationSel: 'span.job-location',
  },
  {
    // remote-work.app job board.
    // Cards are <article>; Tailwind classes churn, so match via the detail link.
    match: /(^|\.)remote-work\.app$/,
    cards: 'article:has(a[href^="/job/"])',
    linkSel: 'a[href^="/job/"]',
    companySel: 'a[href^="/company/"]',
    companyLinkSel: 'a[href^="/company/"]',
    locationSel: 'span:has(svg)',
  },
  {
    // Jobright.ai job search.
    // Card IS the link: a[data-tut="jobs-card-match-score"]. CSS-module hashes
    // change per build — use data-tut + [class*="..."] partial hooks.
    // Note: results are infinite-scrolled (20 at a time); scan captures what's rendered.
    match: /(^|\.)jobright\.ai$/,
    cards: 'a[data-tut="jobs-card-match-score"]',
    linkIsCard: true,
    titleSel: 'h2[class*="index_job-title__"]',
    companySel: 'div[class*="index_company-name__"]',
    locationSel: 'span[class*="index_primary-location__"]',
    urlFrom: (link) => cleanUrl(link.getAttribute('href')).split('?')[0],
  },
  {
    // mailermen.com/jobs — 348 public jobs, 20/page.
    match: /(^|\.)mailermen\.com$/,
    cards: 'main article.card-hover',
    linkSel: 'h3 a[href^="/jobs/"]',
    companySel: 'a[href^="/companies/"]',
    companyLinkSel: 'a[href^="/companies/"]',
    locationSel: 'a[href^="/jobs?"] span',
  },
  {
    // jobfound.org — cards are <article> with a full-card overlay link.
    // Location = the classless span in the meta row (separators have classes).
    match: /(^|\.)jobfound\.org$/,
    cards: 'article:has(> a[href^="/job/"])',
    linkSel: 'a[href^="/job/"]',
    titleSel: 'h3',
    companySel: 'span.font-medium',
    locationSel: 'span:not([class])',
  },
  {
    // hiredoor.in/jobs — the card IS the link: a.group[href^="/jobs/"].
    match: /(^|\.)hiredoor\.in$/,
    cards: 'a.group[href^="/jobs/"]',
    linkIsCard: true,
    titleSel: 'h3',
    companySel: 'div.font-semibold',
    locationSel: 'span.truncate',
  },
  {
    // connectsblue.com/jobs — cards have NO links (JS click navigation), but the
    // page embeds schema.org JSON-LD JobPosting data with title/company/location/url.
    match: /(^|\.)connectsblue\.com$/,
    source: 'jsonld',
  },
];

// Card selectors that cover common job-board markup (generic fallback).
const CARD_SELECTORS = [
  '[data-job-id]',
  '[data-jobid]',
  '[data-occludable-job-id]',
  '.job-card',
  '[class*="job-card"]',
  '[class*="jobCard"]',
  '.result-card',
  '[class*="job-listing"]',
  '[class*="jobsearch-ResultsList"] > *',
  'li[class*="job"]',
  'div[class*="job-result"]',
];

function extractFromCard(card) {
  const link =
    card.tagName === 'A'
      ? card
      : card.querySelector('a[href*="job"], a[href*="career"], a[href]');

  const url = link ? cleanUrl(link.getAttribute('href')) : '';
  if (!url || !/^https?:/.test(url)) return null;

  const title = (
    pickText(card, ['h2', 'h3', '[class*="title"]']) ||
    (link.innerText || '').trim()
  ).slice(0, 200);
  if (!title || title.length < 3) return null;

  const company = pickText(card, ['[class*="company"]', '[data-company]']).slice(0, 120);
  const location = pickText(card, ['[class*="location"]']).slice(0, 120);

  return {
    title,
    company,
    location,
    url,
    site: window.location.hostname.replace(/^www\./, ''),
  };
}

function extractWithAdapter(card, link, adapter) {
  // URL: custom builder (e.g. canonical URL from a data key), else the link href.
  // ignoreHref skips nav/promo links (e.g. /jobs/signup) that match titleLinks.
  if (adapter.ignoreHref) {
    try {
      if (adapter.ignoreHref.test(link.getAttribute('href') || '')) return null;
    } catch {
      /* ignore bad regex */
    }
  }
  let url = '';
  if (adapter.urlFrom) {
    try {
      url = adapter.urlFrom(link, card) || '';
    } catch {
      url = '';
    }
  } else {
    const rawHref = link.getAttribute('href') || '';
    url = cleanUrl(rawHref);
  }
  if (!url || !/^https?:/.test(url)) return null;

  // Title: adapter selector(s), else the link's own text.
  let title = adapter.titleSel ? pickText(card, asArray(adapter.titleSel)) : '';
  if (!title) title = (link.innerText || link.textContent || '').trim();
  title = title.slice(0, 200);
  if (!title || title.length < 3) return null;

  // Company: custom companyFrom hook, else adapter selector(s), else generic fallback.
  let companyRaw = '';
  if (adapter.companyFrom) {
    try {
      companyRaw = adapter.companyFrom(link, card) || '';
    } catch {
      companyRaw = '';
    }
  }
  if (!companyRaw) {
    companyRaw = adapter.companySel
      ? pickText(card, asArray(adapter.companySel))
      : pickText(card, ['[data-company]', '.company', '[class*="company"]']);
  }
  const company = (adapter.parseCompany ? adapter.parseCompany(companyRaw) : companyRaw).slice(0, 120);
  let locRaw = '';
  if (adapter.locationSelAll) {
    const parts = [];
    const seenParts = new Set();
    for (const sel of asArray(adapter.locationSelAll)) {
      card.querySelectorAll(sel).forEach((el) => {
        const t = (el.innerText || el.textContent || '').trim();
        if (t && !seenParts.has(t)) {
          seenParts.add(t);
          parts.push(t);
        }
      });
    }
    locRaw = parts.join(' • ');
  } else if (adapter.locationSel) {
    locRaw = pickText(card, asArray(adapter.locationSel));
  } else {
    locRaw = pickText(card, ['[class*="location"]']);
  }
  const location = (adapter.parseLocation ? adapter.parseLocation(locRaw) : locRaw).slice(0, 120);

  const companyLink = adapter.companyLinkSel ? card.querySelector(adapter.companyLinkSel) : null;

  return {
    title,
    company,
    location,
    url,
    site: window.location.hostname.replace(/^www\./, ''),
    companyUrl: companyLink ? cleanUrl(companyLink.getAttribute('href')) : '',
  };
}

// Extract jobs from schema.org JSON-LD JobPosting data embedded in the page.
// Used by sites whose cards have no links (JS navigation) but publish JSON-LD.
function scanJsonLd() {
  const jobs = [];
  const seen = new Set();
  document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    let data;
    try {
      data = JSON.parse(s.textContent);
    } catch {
      return;
    }
    const items = [];
    const collect = (node) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach(collect);
        return;
      }
      const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
      if (types.includes('JobPosting')) items.push(node);
      if (node['@graph']) collect(node['@graph']);
      if (types.includes('ItemList') && node.itemListElement) collect(node.itemListElement);
    };
    collect(data);
    for (const jp of items) {
      if (jobs.length >= 50) break;
      const url = typeof jp.url === 'string' ? cleanUrl(jp.url) : '';
      if (!url || !/^https?:/.test(url) || seen.has(url)) continue;
      const title = (jp.name || '').trim().slice(0, 200);
      if (!title || title.length < 3) continue;
      const org = jp.hiringOrganization || {};
      const company = (typeof org === 'string' ? org : org.name || '').trim().slice(0, 120);
      let location = '';
      const jl = jp.jobLocation;
      const locObj = Array.isArray(jl) ? jl[0] : jl;
      const addr = locObj && locObj.address;
      if (addr) {
        location =
          typeof addr === 'string'
            ? addr
            : [addr.addressLocality, addr.addressRegion, addr.addressCountry]
                .filter(Boolean)
                .join(', ');
      }
      seen.add(url);
      jobs.push({
        title,
        company,
        location: location.slice(0, 120),
        url,
        site: window.location.hostname.replace(/^www\./, ''),
      });
    }
  });
  return jobs;
}

function scanPage() {
  const seen = new Set();
  const results = [];
  const pushJob = (job) => {
    if (job && job.url && !seen.has(job.url)) {
      seen.add(job.url);
      results.push(job);
    }
  };

  // Site-specific adapter first (when the hostname matches one).
  const adapter = SITE_ADAPTERS.find((a) => a.match.test(window.location.hostname));
  if (adapter) {
    // JSON-LD mode: no card DOM needed.
    if (adapter.source === 'jsonld') return scanJsonLd();
    if (adapter.cards) {
      // Mode A: cards found directly; link lives inside each card
      // (or the card element itself is the link when linkIsCard).
      document.querySelectorAll(adapter.cards).forEach((card) => {
        if (results.length >= 50) return;
        let link = null;
        if (adapter.linkIsCard && card.tagName === 'A') link = card;
        else if (adapter.linkSel) link = card.querySelector(adapter.linkSel);
        if (!link) return;
        pushJob(extractWithAdapter(card, link, adapter));
      });
    } else if (adapter.titleLinks) {
      // Mode B: title links found first; card is an ancestor (or custom cardFrom).
      document.querySelectorAll(adapter.titleLinks).forEach((link) => {
        if (results.length >= 50) return;
        const card = adapter.cardFrom ? adapter.cardFrom(link) : link.closest(adapter.cardAncestor);
        if (!card) return;
        pushJob(extractWithAdapter(card, link, adapter));
      });
    }
    return results;
  }

  // Generic fallback.
  const cards = new Set();
  for (const sel of CARD_SELECTORS) {
    try {
      document.querySelectorAll(sel).forEach((el) => cards.add(el));
    } catch {
      /* ignore invalid selectors */
    }
  }
  for (const card of cards) {
    // Skip nested cards (keep the outermost)
    let skip = false;
    for (const other of cards) {
      if (other !== card && other.contains(card)) {
        skip = true;
        break;
      }
    }
    if (skip) continue;
    const job = extractFromCard(card);
    if (job && !seen.has(job.url)) {
      seen.add(job.url);
      results.push(job);
      if (results.length >= 50) break; // sane cap per scan
    }
  }
  return results;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  try {
    if (msg.type === 'PING') {
      sendResponse({ ok: true, pong: true });
    } else if (msg.type === 'EXTRACT_JOB') {
      sendResponse({ ok: true, job: extractJob() });
    } else if (msg.type === 'SCAN_PAGE') {
      sendResponse({ ok: true, jobs: scanPage() });
    }
  } catch (e) {
    sendResponse({ ok: false, error: String(e) });
  }
  return true;
});

})(); // end JobHunt Tracker content-script IIFE
