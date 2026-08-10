import { useState } from 'react';
import { ChevronLeft, Download, ExternalLink, Trash2, Check, Pencil } from 'lucide-react';
import RouteMap from './RouteMap.jsx';
import RoadLog from './RoadLog.jsx';
import {
  downloadFile, formatCoords, formatDateTime, formatDistance,
  formatDuration, formatSpeed, formatTime, slugify, toGeoJson, toGpx, tripStats,
} from '../services/geoUtils.js';
import { osmLink } from '../services/places.js';
import { softCard, ghostButton, dangerButton, label, value } from './driveUi.js';

export default function TripDetail({ trip, onBack, onRename, onDelete, onSaveRoadLog }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(trip.title || '');

  const st = tripStats(trip);
  const from = trip.points[0];
  const to = trip.points[trip.points.length - 1];
  const heading = trip.title || (trip.fromName || trip.toName
    ? `${trip.fromName || 'Start'} → ${trip.toName || 'Ziel'}`
    : `Fahrt vom ${formatDateTime(trip.startedAt)}`);

  function saveTitle() {
    onRename(trip.id, draft.trim());
    setEditing(false);
  }

  function handleDelete() {
    if (!confirm('Diese Fahrt löschen?')) return;
    onDelete(trip.id);
  }

  const base = slugify(trip.title || `fahrt-${formatDateTime(trip.startedAt).replace(/[.:, ]/g, '-')}`);

  return (
    <div style={s.wrap}>
      <button style={s.back} onClick={onBack}>
        <ChevronLeft size={18} /> Zurück
      </button>

      {editing ? (
        <div style={s.titleRow}>
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveTitle()}
            placeholder="Name der Fahrt, z.B. Arbeitsweg"
            style={s.input}
          />
          <button style={s.iconBtn} onClick={saveTitle} title="Speichern"><Check size={18} /></button>
        </div>
      ) : (
        <div style={s.titleRow}>
          <h2 style={s.title}>{heading}</h2>
          <button style={s.iconBtn} onClick={() => { setDraft(trip.title || ''); setEditing(true); }} title="Umbenennen">
            <Pencil size={16} />
          </button>
        </div>
      )}
      <p style={s.subtitle}>{formatDateTime(trip.startedAt)} · {formatTime(trip.startedAt)}–{formatTime(trip.endedAt)}</p>

      <RouteMap points={trip.points} height={300} />

      <div style={s.grid}>
        <Stat label="Strecke" text={formatDistance(st.distance)} />
        <Stat label="Dauer" text={formatDuration(st.durationMs)} />
        <Stat label="Ø Tempo" text={formatSpeed(st.avgSpeed)} />
        <Stat label="Max. Tempo" text={formatSpeed(st.maxSpeed)} />
      </div>

      <RoadLog trip={trip} onSave={onSaveRoadLog} />

      <div style={s.endpoints}>
        <Endpoint color="#16a34a" title="Start" name={trip.fromName} point={from} time={trip.startedAt} />
        <Endpoint color="#dc2626" title="Ziel" name={trip.toName} point={to} time={trip.endedAt} />
      </div>

      <div style={s.actions}>
        <button style={s.smallBtn} onClick={() => downloadFile(`${base}.gpx`, toGpx(trip), 'application/gpx+xml')}>
          <Download size={16} /> GPX
        </button>
        <button style={s.smallBtn} onClick={() => downloadFile(`${base}.geojson`, toGeoJson(trip), 'application/geo+json')}>
          <Download size={16} /> GeoJSON
        </button>
        <button style={{ ...s.smallBtn, ...dangerButton, padding: '0.6rem 1rem', fontSize: '0.85rem' }} onClick={handleDelete}>
          <Trash2 size={16} /> Löschen
        </button>
      </div>

      {st.gaps.length > 0 && (
        <p style={s.gapNote}>
          {st.gaps.length} {st.gaps.length === 1 ? 'Aufzeichnungslücke' : 'Aufzeichnungslücken'} —
          {' '}{formatDistance(st.gapMeters)} sind als Luftlinie überbrückt (gestrichelt).
          {' '}Das passiert, wenn die App in den Hintergrund gerät.
        </p>
      )}

      <p style={s.hint}>{st.pointCount} Punkte in der Spur</p>
    </div>
  );
}

function Stat({ label: text, text: val }) {
  return (
    <div style={s.stat}>
      <span style={label}>{text}</span>
      <span style={value}>{val}</span>
    </div>
  );
}

function Endpoint({ color, title, name, point, time }) {
  const link = osmLink(point);
  return (
    <div style={s.endpoint}>
      <span style={{ ...s.marker, background: color }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', minWidth: 0 }}>
        <span style={label}>{title} · {formatTime(time)}</span>
        <span style={s.endpointName}>{name || formatCoords(point)}</span>
        {link && (
          <a href={link} target="_blank" rel="noreferrer" style={s.link}>
            Auf Karte ansehen <ExternalLink size={12} />
          </a>
        )}
      </div>
    </div>
  );
}

const s = {
  wrap: { display: 'flex', flexDirection: 'column', gap: '0.85rem' },
  back: {
    ...ghostButton,
    alignSelf: 'flex-start',
    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
    padding: '0.5rem 0.9rem', fontSize: '0.88rem',
  },
  titleRow: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  title: { fontSize: '1.25rem', fontWeight: 700, color: '#1a2d42', letterSpacing: '-0.02em', flex: 1, minWidth: 0 },
  subtitle: { fontSize: '0.82rem', color: 'rgba(30,70,120,0.6)', marginTop: '-0.5rem' },
  input: {
    flex: 1,
    background: 'rgba(255,255,255,0.55)',
    border: '1px solid rgba(255,255,255,0.70)',
    borderRadius: '10px', color: '#1a2d42',
    padding: '0.6rem 0.85rem', fontSize: '0.95rem', outline: 'none', fontFamily: 'inherit',
  },
  iconBtn: {
    background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.7)',
    borderRadius: '10px', padding: '0.5rem', cursor: 'pointer', color: '#1a2d42',
    display: 'inline-flex', alignItems: 'center', flexShrink: 0,
  },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem' },
  stat: { ...softCard, display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0.85rem 1rem' },
  endpoints: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  endpoint: { ...softCard, display: 'flex', alignItems: 'flex-start', gap: '0.7rem', padding: '0.8rem 1rem' },
  marker: { width: '12px', height: '12px', borderRadius: '50%', marginTop: '4px', flexShrink: 0 },
  endpointName: { fontSize: '0.95rem', fontWeight: 600, color: '#1a2d42', wordBreak: 'break-word' },
  link: {
    display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
    fontSize: '0.78rem', color: '#2563eb', textDecoration: 'none', fontWeight: 500,
  },
  actions: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' },
  smallBtn: {
    ...ghostButton,
    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.6rem 1rem', fontSize: '0.85rem',
  },
  hint: { fontSize: '0.75rem', color: 'rgba(30,70,120,0.5)', textAlign: 'center' },
  gapNote: {
    fontSize: '0.78rem', color: '#b45309', lineHeight: 1.45,
    background: 'rgba(180,83,9,0.09)', border: '1px solid rgba(180,83,9,0.2)',
    borderRadius: '12px', padding: '0.6rem 0.8rem',
  },
};
