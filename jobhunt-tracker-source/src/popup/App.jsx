import { useEffect, useState } from 'react';
import { getJobs, saveJob } from '../lib/storage.js';

// The popup injects the content script on open (prefill) and again on scan.
// Ping first so content.js is injected at most once per page — a second
// top-level injection throws "Identifier 'SITE_ADAPTERS' has already been declared".
async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'PING' });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  }
}

export default function App() {
  const [jobs, setJobs] = useState([]);
  const [form, setForm] = useState({ title: '', company: '', location: '', url: '', site: '' });
  const [status, setStatus] = useState('idle'); // idle | saving | saved | error
  const [scan, setScan] = useState('idle'); // idle | scanning | done | error
  const [scanResult, setScanResult] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getJobs().then(setJobs).catch(() => {});
    // Pre-fill from the active tab via the content script (user clicked us, so activeTab applies)
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id || !/^https?:/.test(tab.url || '')) {
          setForm((f) => ({ ...f, url: tab?.url || '' }));
          return;
        }
        await ensureContentScript(tab.id);
        const res = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_JOB' });
        if (res?.ok && res.job) {
          setForm((f) => ({ ...f, ...res.job }));
        } else {
          setForm((f) => ({ ...f, url: tab.url, site: new URL(tab.url).hostname.replace(/^www\./, '') }));
        }
      } catch {
        // Content script unavailable (e.g. chrome:// pages) — user fills manually
      }
    })();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setStatus('saving');
    setError('');
    try {
      const job = await saveJob(form);
      setJobs((j) => [job, ...j]);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err) {
      setError('Could not save — please try again.');
      setStatus('error');
    }
  };

  const handleScan = async () => {
    setScan('scanning');
    setScanResult('');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !/^https?:/.test(tab.url || '')) {
        setScanResult('Open a job search results page first.');
        setScan('error');
        return;
      }
      await ensureContentScript(tab.id);
      const res = await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_PAGE' });
      if (!res?.ok) {
        setScanResult('Could not read this page.');
        setScan('error');
        return;
      }
      const found = res.jobs || [];
      if (found.length === 0) {
        setScanResult('No job cards found on this page.');
        setScan('done');
        return;
      }
      const existing = new Set(jobs.map((j) => j.url));
      let added = 0;
      for (const j of found) {
        if (j.url && !existing.has(j.url)) {
          await saveJob({ ...j, status: undefined });
          existing.add(j.url);
          added++;
        }
      }
      const updated = await getJobs();
      setJobs(updated);
      const dupes = found.length - added;
      setScanResult(
        `${added} new job${added === 1 ? '' : 's'} saved${dupes > 0 ? `, ${dupes} already tracked (skipped)` : ''}.`
      );
      setScan('done');
    } catch {
      setScanResult('Could not scan this page.');
      setScan('error');
    }
  };

  const openDashboard = () => chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' });

  return (
    <div className="popup">
      <header className="popup-header">
        <div>
          <h1>JobHunt Tracker</h1>
          <p>{jobs.length} application{jobs.length === 1 ? '' : 's'} tracked</p>
        </div>
        <button className="link-btn" onClick={openDashboard}>Dashboard →</button>
      </header>

      <button className="scan-btn" onClick={handleScan} disabled={scan === 'scanning'}>
        {scan === 'scanning' ? 'Scanning page…' : '⚡ Scan this page (bulk save)'}
      </button>
      {scanResult && <p className={scan === 'error' ? 'error' : 'scan-ok'}>{scanResult}</p>}
      <p className="hint">On a job search results page, one click saves every listing shown.</p>

      <div className="divider"><span>or save one job</span></div>

      <form className="save-form" onSubmit={handleSave}>
        <label>
          Job title
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Frontend Developer Intern"
            required
          />
        </label>
        <label>
          Company
          <input
            value={form.company}
            onChange={(e) => setForm({ ...form, company: e.target.value })}
            placeholder="e.g. Acme Inc."
          />
        </label>
        <div className="row">
          <label>
            Location
            <input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Remote / City"
            />
          </label>
          <label>
            Site
            <input value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} placeholder="linkedin" />
          </label>
        </div>
        <button type="submit" className="save-btn" disabled={status === 'saving'}>
          {status === 'saving' ? 'Saving…' : status === 'saved' ? '✓ Saved!' : '+ Save this job'}
        </button>
        {error && <p className="error">{error}</p>}
        <p className="hint">No login needed — everything stays in your browser.</p>
      </form>
    </div>
  );
}
