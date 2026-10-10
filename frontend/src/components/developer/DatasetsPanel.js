import { useState } from 'react';
import { downloadDatasetExport } from '../../api/client';

function DatasetsPanel() {
  const [dataset, setDataset] = useState('events');
  const [season, setSeason] = useState('');
  const [format, setFormat] = useState('csv');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  async function handleExport(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const blob = await downloadDatasetExport({ dataset, season, format });
      const contents = await blob.text();
      const empty = format === 'json'
        ? JSON.parse(contents).length === 0
        : contents.trim().split(/\r?\n/).length <= 1;
      if (empty) {
        setNotice('No records match this export. Try another season or dataset.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${dataset}${season ? `-${season}` : ''}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('Your export has been downloaded.');
    } catch (err) {
      setError(err.body?.error || err.message || 'Export failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="developer-panel" id="developer-datasets">
      <div className="card">
        <div className="card-head"><div className="card-title">Build a custom export</div></div>
        <p className="card-note">Download events or driver season statistics as CSV or JSON. Leave the season blank to include all available seasons.</p>
        <form onSubmit={handleExport}>
          <fieldset disabled={busy} style={{ border: 0, padding: 0, display: 'grid', gap: 12 }}>
            <label>Dataset
              <select value={dataset} onChange={(event) => setDataset(event.target.value)}>
                <option value="events">Event log</option>
                <option value="driver-season-stats">Driver season statistics</option>
              </select>
            </label>
            <label>Season (optional)
              <input type="number" min="1950" max="2100" step="1" value={season} onChange={(event) => setSeason(event.target.value)} />
            </label>
            <label>Format
              <select value={format} onChange={(event) => setFormat(event.target.value)}>
                <option value="csv">CSV</option><option value="json">JSON</option>
              </select>
            </label>
            <button type="submit" className="btn btn-primary btn-full" style={{ marginTop: 14 }}>
              {busy ? 'Preparing export…' : 'Download export'}
            </button>
          </fieldset>
        </form>
        {error && <div className="card-note" role="alert">{error}</div>}
        {notice && <div className="card-note" role="status">{notice}</div>}
      </div>
    </div>
  );
}

export default DatasetsPanel;
