import { useEffect, useMemo, useState } from 'react';
import { getJobs, updateJob, deleteJob, STATUSES, STATUS_LABELS, getSites, setSites } from '../lib/storage.js';
import { getSyncSettings, setSyncSettings, registerDevice, linkDevice, fullSync, listDevices, revokeDevice } from '../lib/sync.js';

const DETAIL_FIELDS = [
  { key: 'posterName', label: 'Posted by (name)' },
  { key: 'posterUrl', label: 'Poster profile link' },
  { key: 'companyUrl', label: 'Company page link' },
  { key: 'contactEmail', label: 'Contact email' },
  { key: 'ceoName', label: 'CEO / hiring manager' },
  { key: 'notes', label: 'Notes' },
];

export default function App() {
  const [jobs, setJobs] = useState([]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [sites, setSitesState] = useState([]);
  const [newSite, setNewSite] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({});
  const [sync, setSync] = useState({ backendUrl: '', deviceToken: '', syncKey: '', lastSyncAt: null });
  const [syncForm, setSyncForm] = useState({ url: '', name: '', key: '' });
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [devices, setDevices] = useState([]);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    getJobs().then(setJobs);
    getSites().then(setSitesState);
    getSyncSettings().then((s) => {
      setSync(s);
      setSyncForm((f) => ({ ...f, url: s.backendUrl || '' }));
    });
  }, []);

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      if (filter !== 'all' && j.status !== filter) return false;
      if (query) {
        const q = query.toLowerCase();
        return (j.title + ' ' + j.company + ' ' + j.location).toLowerCase().includes(q);
      }
      return true;
    });
  }, [jobs, filter, query]);

  const counts = useMemo(() => {
    const c = { all: jobs.length };
    for (const s of STATUSES) c[s] = jobs.filter((j) => j.status === s).length;
    return c;
  }, [jobs]);

  const changeStatus = async (id, status) => {
    const updated = await updateJob(id, { status });
    if (updated) setJobs((js) => js.map((j) => (j.id === id ? updated : j)));
  };

  const remove = async (id) => {
    if (!confirm('Delete this application?')) return;
    await deleteJob(id);
    setJobs((js) => js.filter((j) => j.id !== id));
  };

  const startEdit = (job) => {
    const d = {};
    for (const f of DETAIL_FIELDS) d[f.key] = job[f.key] || '';
    setDraft(d);
    setEditingId(job.id);
  };

  const saveDetails = async (id) => {
    const updated = await updateJob(id, draft);
    if (updated) setJobs((js) => js.map((j) => (j.id === id ? updated : j)));
    setEditingId(null);
  };

  const addSite = async (e) => {
    e.preventDefault();
    const name = newSite.trim().toLowerCase().replace(/^www\./, '');
    if (!name || sites.includes(name)) return;
    const next = [...sites, name];
    await setSites(next);
    setSitesState(next);
    setNewSite('');
  };

  const removeSite = async (name) => {
    const next = sites.filter((s) => s !== name);
    await setSites(next);
    setSitesState(next);
  };

  const refreshDevices = async () => {
    try {
      const d = await listDevices();
      setDevices(d.devices || []);
    } catch {
      /* not linked yet */
    }
  };

  useEffect(() => {
    if (sync.deviceToken) refreshDevices();
  }, [sync.deviceToken]);

  const handleRegister = async (e) => {
    e.preventDefault();
    setSyncBusy(true);
    setSyncMsg('');
    try {
      const url = syncForm.url.trim().replace(/\/+$/, '');
      if (!/^https?:\/\//.test(url)) throw new Error('Backend URL http(s):// se start hona chahiye.');
      const r = await registerDevice(url, syncForm.name.trim() || 'This browser');
      const s = await getSyncSettings();
      setSync(s);
      setSyncForm((f) => ({ ...f, url: s.backendUrl }));
      setShowKey(true);
      setSyncMsg('Sync enabled! Apni sync key ko safe jagah save karo — dusre device link karne me kaam ayegi.');
      refreshDevices();
    } catch (err) {
      setSyncMsg(`Error: ${err.message}`);
    } finally {
      setSyncBusy(false);
    }
  };

  const handleLink = async (e) => {
    e.preventDefault();
    setSyncBusy(true);
    setSyncMsg('');
    try {
      const url = syncForm.url.trim().replace(/\/+$/, '');
      if (!syncForm.key.trim()) throw new Error('Sync key dalo.');
      await linkDevice(url, syncForm.key, syncForm.name.trim() || 'This browser');
      const s = await getSyncSettings();
      setSync(s);
      setSyncMsg('Device linked! Ab "Sync Now" dabao.');
      refreshDevices();
    } catch (err) {
      setSyncMsg(`Error: ${err.message}`);
    } finally {
      setSyncBusy(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncBusy(true);
    setSyncMsg('');
    try {
      const r = await fullSync((m) => setSyncMsg(m));
      const s = await getSyncSettings();
      setSync(s);
      const updated = await getJobs();
      setJobs(updated);
      setSyncMsg(`Done — ${r.pushed} pushed, ${r.applied} change(s) applied. Last sync: ${new Date(s.lastSyncAt).toLocaleString()}`);
    } catch (err) {
      setSyncMsg(`Error: ${err.message}`);
    } finally {
      setSyncBusy(false);
    }
  };

  const handleRevoke = async (id) => {
    if (!confirm('Is device ka access revoke karein?')) return;
    try {
      await revokeDevice(id);
      refreshDevices();
    } catch (err) {
      setSyncMsg(`Error: ${err.message}`);
    }
  };

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(sync.syncKey);
      setSyncMsg('Sync key copied!');
    } catch {
      setSyncMsg('Copy nahi hua — manually select karke copy karo.');
    }
  };

  const exportCSV = () => {
    const headers = ['Title', 'Company', 'Location', 'Site', 'URL', 'Status', 'Poster Name', 'Poster URL', 'Company URL', 'Contact Email', 'CEO', 'Notes', 'Created', 'Updated'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = jobs.map((j) =>
      [j.title, j.company, j.location, j.site, j.url, STATUS_LABELS[j.status] || j.status, j.posterName, j.posterUrl, j.companyUrl, j.contactEmail, j.ceoName, j.notes, j.createdAt, j.updatedAt]
        .map(esc)
        .join(',')
    );
    const csv = [headers.map(esc).join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `jobhunt-tracker-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const funnel = useMemo(() => {
    const order = ['saved', 'applied', 'screening', 'interview', 'offer'];
    const max = Math.max(1, ...order.map((s) => jobs.filter((j) => j.status === s).length));
    return order.map((s) => ({
      status: s,
      count: jobs.filter((j) => j.status === s).length,
      width: (jobs.filter((j) => j.status === s).length / max) * 100,
    }));
  }, [jobs]);

  const activity = useMemo(() => {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const count = jobs.filter((j) => (j.createdAt || '').slice(0, 10) === key).length;
      days.push({ key, label: d.toLocaleDateString('en', { day: 'numeric', month: 'short' }), count });
    }
    const max = Math.max(1, ...days.map((d) => d.count));
    return days.map((d) => ({ ...d, height: (d.count / max) * 100 }));
  }, [jobs]);

  return (
    <div className="dash">
      <header className="dash-header">
        <div>
          <h1>JobHunt Tracker</h1>
          <p>Your application pipeline — no login, data stays in this browser.</p>
        </div>
      </header>

      <section className="stats">
        {['all', ...STATUSES].map((s) => (
          <button key={s} className={`stat ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)}>
            <span className="stat-num">{counts[s] || 0}</span>
            <span className="stat-label">{s === 'all' ? 'Total' : STATUS_LABELS[s]}</span>
          </button>
        ))}
      </section>

      <div className="toolbar">
        <input
          className="search"
          placeholder="Search title, company, location…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="export-btn" onClick={exportCSV} disabled={jobs.length === 0}>
          ⬇ Export CSV
        </button>
      </div>

      <section className="insights">
        <div className="insight-card">
          <h2>Pipeline funnel</h2>
          {funnel.map((f) => (
            <div key={f.status} className="funnel-row">
              <span className="funnel-label">{STATUS_LABELS[f.status]}</span>
              <div className="funnel-track">
                <div className="funnel-bar" style={{ width: `${Math.max(f.width, f.count > 0 ? 4 : 0)}%` }} />
              </div>
              <span className="funnel-num">{f.count}</span>
            </div>
          ))}
        </div>
        <div className="insight-card">
          <h2>Saved per day <span className="muted small">(last 14 days)</span></h2>
          <div className="activity">
            {activity.map((d) => (
              <div key={d.key} className="activity-col" title={`${d.label}: ${d.count}`}>
                <div className="activity-track">
                  <div className="activity-bar" style={{ height: `${d.height}%` }} />
                </div>
                <span className="activity-label">{d.label.split(' ')[0]}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="job-list">
        {filtered.length === 0 && <p className="empty">No applications yet. Click the extension icon on any job page to save one.</p>}
        {filtered.map((j) => (
          <article key={j.id} className="job-card">
            <div className="job-main">
              <h3>{j.title}</h3>
              <p className="meta">
                {[j.company, j.location, j.site].filter(Boolean).join(' · ')}
              </p>
              <div className="job-links">
                {j.url && (
                  <a href={j.url} target="_blank" rel="noreferrer" className="job-link">
                    Open posting ↗
                  </a>
                )}
                {j.companyUrl && (
                  <a href={j.companyUrl} target="_blank" rel="noreferrer" className="job-link">
                    Company page ↗
                  </a>
                )}
                {j.posterUrl && (
                  <a href={j.posterUrl} target="_blank" rel="noreferrer" className="job-link">
                    Poster ↗
                  </a>
                )}
              </div>
              {(j.posterName || j.contactEmail || j.ceoName) && (
                <p className="meta">
                  {[j.posterName && `👤 ${j.posterName}`, j.contactEmail && `✉️ ${j.contactEmail}`, j.ceoName && `🏢 ${j.ceoName}`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
              {editingId === j.id && (
                <div className="details-form">
                  {DETAIL_FIELDS.map((f) => (
                    <label key={f.key}>
                      {f.label}
                      <input
                        value={draft[f.key] || ''}
                        onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                        placeholder={f.key === 'notes' ? 'e.g. Referred by…' : '—'}
                      />
                    </label>
                  ))}
                  <div className="details-btns">
                    <button className="primary" onClick={() => saveDetails(j.id)}>Save details</button>
                    <button className="ghost" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                  <p className="muted small">Empty fields stay empty — nothing is auto-filled or guessed.</p>
                </div>
              )}
            </div>
            <div className="job-actions">
              <select value={j.status} onChange={(e) => changeStatus(j.id, e.target.value)} aria-label="Status">
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
              <button className="mini" onClick={() => (editingId === j.id ? setEditingId(null) : startEdit(j))} title="Edit details">
                ✎
              </button>
              <button className="del" onClick={() => remove(j.id)} title="Delete">✕</button>
            </div>
          </article>
        ))}
      </section>

      <section className="sites">
        <h2>Tracked websites</h2>
        <p className="muted">Add the job sites you use — the extension will offer one-click save on them.</p>
        <form onSubmit={addSite} className="site-form">
          <input
            value={newSite}
            onChange={(e) => setNewSite(e.target.value)}
            placeholder="e.g. linkedin.com"
          />
          <button type="submit">Add</button>
        </form>
        <div className="site-chips">
          {sites.map((s) => (
            <span key={s} className="chip">
              {s} <button onClick={() => removeSite(s)} title="Remove">✕</button>
            </span>
          ))}
          {sites.length === 0 && <span className="muted">None yet — add your first site above.</span>}
        </div>
      </section>

      <section className="sites">
        <h2>☁️ Cloud sync <span className="muted small">(Phase 2 — optional)</span></h2>
        {!sync.deviceToken ? (
          <>
            <p className="muted">
              Apna backend chalao aur sync enable karo — data doosre browser me bhi milega.
              Koi login/password nahi, sirf ek sync key.
            </p>
            <form onSubmit={handleRegister} className="site-form">
              <input
                value={syncForm.url}
                onChange={(e) => setSyncForm({ ...syncForm, url: e.target.value })}
                placeholder="Backend URL, e.g. http://localhost:4000"
              />
              <input
                value={syncForm.name}
                onChange={(e) => setSyncForm({ ...syncForm, name: e.target.value })}
                placeholder="Device name (optional)"
                style={{ maxWidth: 180 }}
              />
              <button type="submit" disabled={syncBusy}>Enable sync</button>
            </form>
            <details className="link-details">
              <summary>Pehle se sync key hai? Dusra device link karo</summary>
              <form onSubmit={handleLink} className="site-form" style={{ marginTop: 8 }}>
                <input
                  value={syncForm.key}
                  onChange={(e) => setSyncForm({ ...syncForm, key: e.target.value })}
                  placeholder="Sync key yahan paste karo"
                />
                <button type="submit" disabled={syncBusy}>Link device</button>
              </form>
            </details>
          </>
        ) : (
          <>
            <p className="muted">
              Linked ✓ &nbsp;·&nbsp; Last sync:{' '}
              {sync.lastSyncAt ? new Date(sync.lastSyncAt).toLocaleString() : 'never'}
            </p>
            <div className="details-btns" style={{ marginBottom: 10 }}>
              <button className="primary" onClick={handleSyncNow} disabled={syncBusy}>
                {syncBusy ? 'Syncing…' : '🔄 Sync Now'}
              </button>
              <button className="ghost" onClick={() => setShowKey((v) => !v)}>
                {showKey ? 'Hide sync key' : 'Show sync key'}
              </button>
            </div>
            {showKey && (
              <div className="key-box">
                <code>{sync.syncKey}</code>
                <button className="ghost" onClick={copyKey}>Copy</button>
              </div>
            )}
            {devices.length > 0 && (
              <div className="device-list">
                <h3>Linked devices</h3>
                {devices.map((d) => (
                  <div key={d.id} className="device-row">
                    <span>
                      {d.name || 'Unnamed device'}{d.current ? ' (this device)' : ''}
                      <span className="muted small"> · last seen {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : 'never'}</span>
                    </span>
                    {!d.current && !d.revoked && (
                      <button className="del" onClick={() => handleRevoke(d.id)} title="Revoke access">Revoke</button>
                    )}
                    {d.revoked && <span className="muted small">revoked</span>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {syncMsg && <p className={syncMsg.startsWith('Error') ? 'error' : 'scan-ok'} style={{ marginTop: 8 }}>{syncMsg}</p>}
      </section>
    </div>
  );
}
