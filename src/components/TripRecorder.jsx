import { useEffect, useState } from 'react';
import { Play, Pause, Square, Trash2, Satellite, AlertTriangle } from 'lucide-react';
import RouteMap from './RouteMap.jsx';
import { formatDistance, formatDuration, formatSpeed, pathLength, segmentSpeed } from '../services/geoUtils.js';
import { glass, softCard, primaryButton, ghostButton, dangerButton, label, value } from './driveUi.js';

/** Live-Ansicht der laufenden Aufzeichnung. */
export default function TripRecorder({ recorder, onFinished }) {
  const { trip, status, lastFix, error, storageWarning, start, pause, resume, stop, discard } = recorder;
  const [now, setNow] = useState(Date.now());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (status !== 'recording') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status]);

  const points = trip?.points ?? [];
  const distance = pathLength(points);
  const duration = trip ? trip.movingMs + (trip.resumedAt ? now - trip.resumedAt : 0) : 0;
  const avgSpeed = duration > 0 ? distance / (duration / 1000) : 0;
  // Nicht jedes Gerät liefert ein Tempo mit — dann aus den letzten beiden Punkten schätzen
  const currentSpeed = status !== 'recording'
    ? 0
    : typeof lastFix?.speed === 'number'
      ? lastFix.speed
      : segmentSpeed(points[points.length - 2], points[points.length - 1]) ?? 0;

  async function handleStop() {
    setSaving(true);
    try {
      const saved = await stop();
      onFinished(saved);
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    if (points.length > 1 && !confirm('Aufzeichnung verwerfen? Die Strecke geht verloren.')) return;
    discard();
  }

  const gpsQuality = lastFix?.accuracy == null
    ? { text: 'Suche Signal', color: 'rgba(30,70,120,0.55)' }
    : lastFix.accuracy <= 15
      ? { text: `Genau (±${Math.round(lastFix.accuracy)} m)`, color: '#15803d' }
      : lastFix.accuracy <= 40
        ? { text: `Brauchbar (±${Math.round(lastFix.accuracy)} m)`, color: '#b45309' }
        : { text: `Schwach (±${Math.round(lastFix.accuracy)} m)`, color: '#b91c1c' };

  return (
    <div style={s.wrap}>
      <div style={s.statusRow}>
        <span style={{ ...s.badge, ...(status === 'recording' ? s.badgeLive : status === 'paused' ? s.badgePaused : s.badgeIdle) }}>
          {status === 'recording' && <span style={s.pulse} />}
          {status === 'recording' ? 'Zeichnet auf' : status === 'paused' ? 'Pausiert' : 'Bereit'}
        </span>
        <span style={{ ...s.gps, color: gpsQuality.color }}>
          <Satellite size={14} /> {gpsQuality.text}
        </span>
      </div>

      <RouteMap points={points} live height={260} />

      <div style={s.grid}>
        <Stat label="Strecke" text={formatDistance(distance)} />
        <Stat label="Dauer" text={formatDuration(duration)} />
        <Stat label="Tempo" text={formatSpeed(currentSpeed)} />
        <Stat label="Ø Tempo" text={formatSpeed(avgSpeed)} />
      </div>

      {error && (
        <div style={s.notice}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>{error}</span>
        </div>
      )}
      {storageWarning && (
        <div style={s.notice}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>Die Fahrt kann nicht zwischengespeichert werden — bei einem Reload geht sie verloren.</span>
        </div>
      )}

      <div style={s.actions}>
        {status === 'idle' && (
          <button style={{ ...primaryButton, flex: 1 }} onClick={start}>
            <span style={s.btnInner}><Play size={18} /> Fahrt starten</span>
          </button>
        )}

        {status === 'recording' && (
          <>
            <button style={{ ...ghostButton, flex: 1 }} onClick={pause}>
              <span style={s.btnInner}><Pause size={18} /> Pause</span>
            </button>
            <button style={{ ...primaryButton, flex: 1 }} onClick={handleStop} disabled={saving}>
              <span style={s.btnInner}><Square size={18} /> {saving ? 'Speichert …' : 'Beenden'}</span>
            </button>
          </>
        )}

        {status === 'paused' && (
          <>
            <button style={{ ...primaryButton, flex: 1 }} onClick={resume}>
              <span style={s.btnInner}><Play size={18} /> Weiter</span>
            </button>
            <button style={{ ...ghostButton, flex: 1 }} onClick={handleStop} disabled={saving}>
              <span style={s.btnInner}><Square size={18} /> {saving ? 'Speichert …' : 'Beenden'}</span>
            </button>
            <button style={dangerButton} onClick={handleDiscard} title="Aufzeichnung verwerfen">
              <Trash2 size={18} />
            </button>
          </>
        )}
      </div>

      {status === 'idle' && (
        <p style={s.hint}>
          Bildschirm anlassen und die App im Vordergrund lassen — im Hintergrund stoppen mobile Browser die Ortung.
        </p>
      )}
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

const s = {
  wrap: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  statusRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' },
  badge: {
    display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
    padding: '0.35rem 0.8rem', borderRadius: '999px',
    fontSize: '0.8rem', fontWeight: 600,
    ...glass,
  },
  badgeLive: { background: 'rgba(220,38,38,0.12)', color: '#b91c1c', border: '1px solid rgba(220,38,38,0.25)' },
  badgePaused: { background: 'rgba(180,83,9,0.12)', color: '#b45309', border: '1px solid rgba(180,83,9,0.25)' },
  badgeIdle: { background: 'rgba(255,255,255,0.5)', color: 'rgba(30,60,100,0.7)', border: '1px solid rgba(255,255,255,0.7)' },
  pulse: {
    width: '8px', height: '8px', borderRadius: '50%', background: '#dc2626',
    animation: 'pulse 1.4s ease-in-out infinite',
  },
  gps: { display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 500 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem' },
  stat: { ...softCard, display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0.85rem 1rem' },
  actions: { display: 'flex', gap: '0.6rem', flexWrap: 'wrap' },
  btnInner: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' },
  notice: {
    display: 'flex', gap: '0.5rem',
    background: 'rgba(220,38,38,0.10)', border: '1px solid rgba(220,38,38,0.22)',
    borderRadius: '14px', padding: '0.75rem 0.9rem',
    color: '#b91c1c', fontSize: '0.85rem', lineHeight: 1.4,
  },
  hint: { fontSize: '0.8rem', color: 'rgba(30,70,120,0.6)', lineHeight: 1.5, textAlign: 'center' },
};
