import { useEffect, useRef, useState } from 'react';
import { Copy, ListOrdered, RefreshCw, X } from 'lucide-react';
import { describeRoute, segmentsToText } from '../services/roadNaming.js';
import { softCard, ghostButton, primaryButton, label } from './driveUi.js';

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
        onSave(trip.id, { segments: result.segments, createdAt: Date.now(), failed: result.failed });
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
      await navigator.clipboard.writeText(segmentsToText(segments));
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

      {segments && (
        <ol style={s.list}>
          {segments.map((segment, i) => (
            <li key={i} style={s.item}>
              <span style={s.km}>km {segment.fromKm.toFixed(0)}</span>
              <span style={s.text}>
                {i === 0
                  ? <>Start auf der <strong>{segment.road}</strong></>
                  : segment.atPlace
                    ? <>bei <strong>{segment.atPlace}</strong> auf die <strong>{segment.road}</strong></>
                    : <>weiter auf der <strong>{segment.road}</strong></>}
                <span style={s.len}> · {segment.lengthKm.toFixed(0)} km</span>
              </span>
            </li>
          ))}
        </ol>
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
          Fragt für rund alle 3 km die Straße bei OpenStreetMap ab. Bei einer langen Fahrt dauert das
          ein bis zwei Minuten und braucht Internet.
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
  item: { display: 'flex', gap: '0.6rem', alignItems: 'baseline', fontSize: '0.88rem', lineHeight: 1.45 },
  km: {
    fontSize: '0.72rem', fontWeight: 600, color: 'rgba(30,70,120,0.6)',
    minWidth: '52px', flexShrink: 0, fontVariantNumeric: 'tabular-nums',
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
