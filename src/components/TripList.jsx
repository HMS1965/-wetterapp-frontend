import { useRef, useState } from 'react';
import { ChevronRight, Download, Route, Upload } from 'lucide-react';
import RouteMap from './RouteMap.jsx';
import { downloadFile, formatDistance, formatDuration, formatDateTime, tripStats } from '../services/geoUtils.js';
import { exportAll, importAll, saveTrip } from '../services/tripStore.js';
import { parseGpx } from '../services/gpxImport.js';
import { softCard, ghostButton, label, value } from './driveUi.js';

function tripLabel(trip) {
  if (trip.title) return trip.title;
  if (trip.fromName || trip.toName) return `${trip.fromName || 'Start'} → ${trip.toName || 'Ziel'}`;
  return `Fahrt vom ${formatDateTime(trip.startedAt)}`;
}

export default function TripList({ trips, onOpen, onImported }) {
  const fileRef = useRef(null);
  const [note, setNote] = useState(null);

  function handleExport() {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`fahrtenbuch-${stamp}.json`, exportAll(), 'application/json');
  }

  async function handleImport(e) {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (files.length === 0) return;

    let added = 0;
    const problems = [];
    for (const file of files) {
      try {
        const text = await file.text();
        // GPX kommt von fremden Logger-Apps, JSON ist die eigene Sicherung
        if (/\.gpx$/i.test(file.name) || text.trimStart().startsWith('<')) {
          const trip = parseGpx(text, { fileName: file.name });
          if (!saveTrip(trip)) throw new Error('Der Speicher reicht nicht.');
          added++;
        } else {
          added += importAll(text).added;
        }
      } catch (err) {
        problems.push(`${file.name}: ${err.message}`);
      }
    }

    if (added > 0) onImported?.();
    setNote([
      added > 0 ? `${added} ${added === 1 ? 'Fahrt' : 'Fahrten'} eingelesen.` : null,
      added === 0 && problems.length === 0 ? 'Alles war schon vorhanden.' : null,
      ...problems,
    ].filter(Boolean).join(' '));
  }

  const backup = (
    <div style={s.backup}>
      <button style={s.backupBtn} onClick={handleExport} disabled={trips.length === 0}>
        <Download size={15} /> Sichern
      </button>
      <button style={s.backupBtn} onClick={() => fileRef.current?.click()}>
        <Upload size={15} /> Einlesen
      </button>
      <input ref={fileRef} type="file" multiple accept=".json,.gpx,application/json,application/gpx+xml"
        onChange={handleImport} style={{ display: 'none' }} />
    </div>
  );

  if (trips.length === 0) {
    return (
      <div style={s.wrap}>
        <div style={s.empty}>
          <Route size={32} style={{ opacity: 0.4 }} />
          <p style={s.emptyTitle}>Noch keine Fahrten</p>
          <p style={s.emptyText}>Starte eine Aufzeichnung — die gefahrene Strecke landet danach hier.</p>
        </div>
        {backup}
        {note && <p style={s.note}>{note}</p>}
      </div>
    );
  }

  const total = trips.reduce(
    (acc, t) => {
      const st = tripStats(t);
      return { distance: acc.distance + st.distance, duration: acc.duration + (st.durationMs || 0) };
    },
    { distance: 0, duration: 0 }
  );

  return (
    <div style={s.wrap}>
      <div style={s.summary}>
        <div style={s.summaryItem}>
          <span style={label}>Fahrten</span>
          <span style={value}>{trips.length}</span>
        </div>
        <div style={s.summaryItem}>
          <span style={label}>Gesamt</span>
          <span style={value}>{formatDistance(total.distance)}</span>
        </div>
        <div style={s.summaryItem}>
          <span style={label}>Zeit</span>
          <span style={value}>{formatDuration(total.duration)}</span>
        </div>
      </div>

      {trips.map(trip => {
        const st = tripStats(trip);
        return (
          <button key={trip.id} style={s.item} onClick={() => onOpen(trip)}>
            <div style={s.thumb}>
              <RouteMap points={trip.points} height={72} compact />
            </div>
            <div style={s.info}>
              <span style={s.itemTitle}>{tripLabel(trip)}</span>
              <span style={s.itemMeta}>{formatDateTime(trip.startedAt)}</span>
              <span style={s.itemStats}>
                {formatDistance(st.distance)} · {formatDuration(st.durationMs)}
              </span>
            </div>
            <ChevronRight size={18} style={{ color: 'rgba(30,60,100,0.4)', flexShrink: 0 }} />
          </button>
        );
      })}

      {backup}
      {note && <p style={s.note}>{note}</p>}
      <p style={s.backupHint}>
        Die Fahrten liegen nur in diesem Browser. Sichere sie, bevor du Browserdaten löschst oder das Gerät wechselst.
        Über "Einlesen" kommen auch GPX-Dateien aus anderen Aufzeichnungs-Apps herein.
      </p>
    </div>
  );
}

const s = {
  wrap: { display: 'flex', flexDirection: 'column', gap: '0.6rem' },
  summary: { ...softCard, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', padding: '0.9rem 1rem' },
  summaryItem: { display: 'flex', flexDirection: 'column', gap: '0.2rem' },
  item: {
    ...softCard,
    display: 'flex', alignItems: 'center', gap: '0.85rem',
    padding: '0.7rem 0.9rem', width: '100%', textAlign: 'left',
    cursor: 'pointer', fontFamily: 'inherit',
  },
  thumb: { width: '78px', flexShrink: 0 },
  info: { display: 'flex', flexDirection: 'column', gap: '0.15rem', flex: 1, minWidth: 0 },
  itemTitle: {
    fontSize: '0.98rem', fontWeight: 600, color: '#1a2d42',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  itemMeta: { fontSize: '0.78rem', color: 'rgba(30,70,120,0.6)' },
  itemStats: { fontSize: '0.85rem', fontWeight: 600, color: 'rgba(20,60,110,0.85)' },
  backup: { display: 'flex', gap: '0.5rem', marginTop: '0.3rem' },
  backupBtn: {
    ...ghostButton,
    flex: 1,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
    padding: '0.6rem 0.8rem', fontSize: '0.85rem',
  },
  backupHint: { fontSize: '0.72rem', color: 'rgba(30,70,120,0.55)', lineHeight: 1.45, textAlign: 'center' },
  note: { fontSize: '0.8rem', color: '#1d4ed8', textAlign: 'center' },
  empty: {
    ...softCard,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
    padding: '2.5rem 1.5rem', textAlign: 'center', color: '#1a2d42',
  },
  emptyTitle: { fontSize: '1rem', fontWeight: 600 },
  emptyText: { fontSize: '0.85rem', color: 'rgba(30,70,120,0.65)', lineHeight: 1.5, maxWidth: '260px' },
};
