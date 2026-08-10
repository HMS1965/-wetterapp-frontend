import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, CornerUpLeft, CornerUpRight, ListOrdered, RefreshCw, RotateCcw, X } from 'lucide-react';
import { describeRoute, estimateRoadLookup, formatLeg, isRoadRef, segmentsToText } from '../services/roadNaming.js';
import { softCard, ghostButton, primaryButton, label } from './driveUi.js';

/** Abbiegerichtung an der Wechselstelle. */
function TurnIcon({ turn }) {
  const size = 15;
  if (turn === 'left') return <CornerUpLeft size={size} style={s.turn} aria-label="links" />;
  if (turn === 'right') return <CornerUpRight size={size} style={s.turn} aria-label="rechts" />;
  if (turn === 'around') return <RotateCcw size={size} style={s.turn} aria-label="wenden" />;
  // Geradeaus bekommt keinen Pfeil — so stechen die echten Abbiegungen hervor
  return <span style={{ width: size, flexShrink: 0 }} />;
}

/** Wartezeit in Worten — "1 Minuten" liest sich falsch. */
function formatMinutes(seconds) {
  if (seconds < 90) return 'gut eine Minute';
  const minutes = Math.round(seconds / 60);
  return `etwa ${minutes} Minuten`;
}

/**
 * Die gefahrene Strecke in Worten: welche Straße ab wo.
 * Die Auswertung fragt einen öffentlichen Kartendienst ab und dauert
 * deshalb ein bis zwei Minuten — das Ergebnis wird an der Fahrt gespeichert.
 */
export default function RoadLog({ trip, onSave }) {
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef(null);

  const segments = trip.roadLog?.segments || null;
  const running = progress !== null;
  const estimate = useMemo(() => estimateRoadLookup(trip.points), [trip.points]);

  useEffect(() => () => abortRef.current?.abort(), []);
  // Wechsel auf eine andere Fahrt darf keine fremde Auswertung anzeigen
  useEffect(() => { setProgress(null); setError(null); setCopied(false); }, [trip.id]);

  async function analyse() {
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setProgress({ done: 0, total: 0 });
    try {
      const result = await describeRoute(trip.points, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      if (controller.signal.aborted) return;
      if (result.segments.length === 0) {
        setError('Der Kartendienst hat keine Straßen zurückgegeben. Später noch einmal versuchen.');
      } else {
        onSave(trip.id, {
          segments: result.segments,
          start: result.start,
          end: result.end,
          createdAt: Date.now(),
          failed: result.failed,
        });
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        setError('Die Auswertung ist fehlgeschlagen — vermutlich keine Verbindung zum Kartendienst.');
      }
    } finally {
      setProgress(null);
      abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setProgress(null);
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(segmentsToText(segments, trip.roadLog));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Kopieren wurde vom Browser abgelehnt.');
    }
  }

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <ListOrdered size={16} />
        <span style={s.headText}>Strecke in Worten</span>
      </div>

      {segments && trip.roadLog?.start?.address && (
        <p style={s.endpoint}>
          <span style={{ ...s.pin, background: '#16a34a' }} />
          Start: <strong>{[trip.roadLog.start.address, trip.roadLog.start.place].filter(Boolean).join(', ')}</strong>
        </p>
      )}

      {segments && (
        <ol style={s.list}>
          {segments.map((segment, i) => (
            <li key={i} style={s.item}>
              <span style={s.km}>km {segment.fromKm.toFixed(segment.fromKm < 10 ? 1 : 0)}</span>
              <TurnIcon turn={i === 0 ? null : segment.turn} />
              <span style={s.text}>
                {i === 0
                  ? <>Start: <strong>{segment.road}</strong></>
                  : segment.atPlace
                    ? <>
                        bei <strong>{segment.atPlace}</strong>
                        {isRoadRef(segment.road) ? ' auf die ' : ' über '}
                        <strong>{segment.road}</strong>
                      </>
                    : <>weiter {isRoadRef(segment.road) ? 'auf der ' : 'über '}<strong>{segment.road}</strong></>}
                <span style={s.len}> · {formatLeg(segment.lengthKm)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}

      {segments && trip.roadLog?.end?.address && (
        <p style={s.endpoint}>
          <span style={{ ...s.pin, background: '#dc2626' }} />
          Ziel: <strong>{[trip.roadLog.end.address, trip.roadLog.end.place].filter(Boolean).join(', ')}</strong>
        </p>
      )}

      {segments && trip.roadLog?.failed > 0 && (
        <p style={s.warn}>
          {trip.roadLog.failed} Abfragen sind fehlgeschlagen — einzelne Abschnitte können fehlen.
        </p>
      )}

      {running && (
        <div style={s.progress}>
          <span style={label}>
            Werte aus … {progress.total > 0 ? `${progress.done} von ${progress.total} Punkten` : 'Start'}
          </span>
          <div style={s.barOuter}>
            <div style={{ ...s.barInner, width: `${progress.total ? (progress.done / progress.total) * 100 : 3}%` }} />
          </div>
          <button style={s.cancelBtn} onClick={cancel}><X size={14} /> Abbrechen</button>
        </div>
      )}

      {error && <p style={s.error}>{error}</p>}

      {!running && (
        <div style={s.actions}>
          <button style={segments ? s.smallBtn : { ...primaryButton, flex: 1, fontSize: '0.9rem', padding: '0.7rem 1rem' }}
            onClick={analyse}>
            <span style={s.btnInner}>
              <RefreshCw size={15} /> {segments ? 'Neu auswerten' : 'Strecke auswerten'}
            </span>
          </button>
          {segments && (
            <button style={s.smallBtn} onClick={copyText}>
              <span style={s.btnInner}><Copy size={15} /> {copied ? 'Kopiert' : 'Als Text'}</span>
            </button>
          )}
        </div>
      )}

      {!segments && !running && (
        <p style={s.hint}>
          Fragt die Straße bei OpenStreetMap ab — im Ort engmaschig, auf der Autobahn grob.
          Rund {estimate.requests} Abfragen, {formatMinutes(estimate.seconds)}. Braucht Internet.
        </p>
      )}
    </div>
  );
}

const s = {
  wrap: { ...softCard, display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '0.9rem 1rem' },
  head: { display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#1a2d42' },
  headText: { fontSize: '0.95rem', fontWeight: 600 },
  list: { listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.45rem' },
  endpoint: { display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.85rem', color: '#1a2d42' },
  pin: { width: '9px', height: '9px', borderRadius: '50%', flexShrink: 0 },
  item: { display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.88rem', lineHeight: 1.45 },
  turn: { color: '#2563eb', flexShrink: 0, marginTop: '2px' },
  km: {
    fontSize: '0.72rem', fontWeight: 600, color: 'rgba(30,70,120,0.6)',
    minWidth: '52px', flexShrink: 0, fontVariantNumeric: 'tabular-nums', marginTop: '3px',
  },
  text: { color: '#1a2d42' },
  len: { color: 'rgba(30,70,120,0.6)', fontSize: '0.8rem' },
  actions: { display: 'flex', gap: '0.5rem' },
  smallBtn: { ...ghostButton, flex: 1, padding: '0.6rem 0.8rem', fontSize: '0.85rem' },
  btnInner: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' },
  progress: { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  barOuter: { height: '6px', background: 'rgba(30,80,140,0.12)', borderRadius: '999px', overflow: 'hidden' },
  barInner: { height: '100%', background: 'linear-gradient(90deg, #3b82f6, #60a5fa)', transition: 'width 0.3s' },
  cancelBtn: {
    ...ghostButton, alignSelf: 'flex-start',
    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
    padding: '0.4rem 0.7rem', fontSize: '0.8rem',
  },
  hint: { fontSize: '0.76rem', color: 'rgba(30,70,120,0.6)', lineHeight: 1.45 },
  warn: { fontSize: '0.78rem', color: '#b45309', lineHeight: 1.4 },
  error: { fontSize: '0.82rem', color: '#b91c1c', lineHeight: 1.4 },
};
