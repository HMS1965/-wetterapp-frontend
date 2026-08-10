import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, CircleDot, GitCompareArrows, Route } from 'lucide-react';
import useTripRecorder from '../hooks/useTripRecorder.js';
import TripRecorder from './TripRecorder.jsx';
import TripList from './TripList.jsx';
import TripDetail from './TripDetail.jsx';
import RouteCompare from './RouteCompare.jsx';
import { deleteTrip, loadTrips, renameTrip, saveRoadLog } from '../services/tripStore.js';
import { glass, panel } from './driveUi.js';

/** Fahrtenrekorder: zeichnet die gefahrene Strecke auf — ohne Navigation, ohne Routenplanung. */
export default function DriveApp({ onBack }) {
  const recorder = useTripRecorder();
  const [tab, setTab] = useState('record');
  const [trips, setTrips] = useState([]);
  const [openId, setOpenId] = useState(null);

  const refresh = useCallback(() => setTrips(loadTrips()), []);
  useEffect(() => { refresh(); }, [refresh]);

  const openTrip = trips.find(t => t.id === openId) || null;

  function handleFinished(saved) {
    refresh();
    if (saved) {
      setOpenId(saved.id);
      setTab('trips');
    }
  }

  function handleRename(id, title) {
    renameTrip(id, title);
    refresh();
  }

  function handleRoadLog(id, roadLog) {
    saveRoadLog(id, roadLog);
    refresh();
  }

  function handleDelete(id) {
    deleteTrip(id);
    setOpenId(null);
    refresh();
  }

  function handleBack() {
    if (recorder.status === 'recording' &&
        !confirm('Die Aufzeichnung läuft. Beim Verlassen wird sie pausiert und später fortgesetzt. Trotzdem zurück?')) {
      return;
    }
    if (recorder.status === 'recording') recorder.pause();
    onBack();
  }

  return (
    <div style={s.container}>
      <div style={s.inner}>
        <div style={s.header}>
          <button style={s.backBtn} onClick={handleBack} title="Zurück zur WetterApp">
            <ChevronLeft size={18} />
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={s.title}>Fahrtenrekorder</h1>
            <p style={s.subtitle}>Zeichnet auf, wie du wirklich gefahren bist</p>
          </div>
        </div>

        <div style={s.tabs}>
          <button style={{ ...s.tab, ...(tab === 'record' ? s.tabActive : null) }} onClick={() => setTab('record')}>
            <CircleDot size={16} /> Aufnahme
          </button>
          <button
            style={{ ...s.tab, ...(tab === 'trips' ? s.tabActive : null) }}
            onClick={() => { setTab('trips'); setOpenId(null); refresh(); }}
          >
            <Route size={16} /> Fahrten
          </button>
          <button
            style={{ ...s.tab, ...(tab === 'compare' ? s.tabActive : null) }}
            onClick={() => { setTab('compare'); refresh(); }}
          >
            <GitCompareArrows size={16} /> Vergleich
          </button>
        </div>

        {tab === 'record' && <TripRecorder recorder={recorder} onFinished={handleFinished} />}
        {tab === 'compare' && <RouteCompare trips={trips} />}
        {tab === 'trips' && (openTrip
          ? <TripDetail trip={openTrip} onBack={() => setOpenId(null)} onRename={handleRename} onDelete={handleDelete} onSaveRoadLog={handleRoadLog} />
          : <TripList trips={trips} onOpen={t => setOpenId(t.id)} onImported={refresh} />
        )}
      </div>
    </div>
  );
}

const s = {
  container: {
    position: 'relative', zIndex: 1,
    display: 'flex', justifyContent: 'center',
    minHeight: '100vh', padding: '1.5rem 1rem 2.5rem',
  },
  inner: {
    ...panel,
    display: 'flex', flexDirection: 'column', gap: '1rem',
    padding: '1.5rem 1.25rem',
    maxWidth: '520px', width: '100%',
    alignSelf: 'flex-start',
  },
  header: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  backBtn: {
    background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.7)',
    borderRadius: '12px', padding: '0.55rem', cursor: 'pointer', color: '#1a2d42',
    display: 'inline-flex', alignItems: 'center',
  },
  title: { fontSize: '1.4rem', fontWeight: 700, color: '#1a2d42', letterSpacing: '-0.02em' },
  subtitle: { fontSize: '0.82rem', color: 'rgba(30,70,120,0.6)' },
  tabs: {
    display: 'flex', gap: '0.35rem',
    background: 'rgba(255,255,255,0.35)',
    border: '1px solid rgba(255,255,255,0.6)',
    borderRadius: '14px', padding: '0.25rem',
    ...glass,
  },
  tab: {
    flex: 1,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
    background: 'transparent', border: 'none', borderRadius: '11px',
    padding: '0.6rem 0.5rem', fontSize: '0.85rem', fontWeight: 600,
    color: 'rgba(30,70,120,0.65)', cursor: 'pointer', fontFamily: 'inherit',
    transition: 'background 0.15s, color 0.15s',
  },
  tabActive: {
    background: 'rgba(255,255,255,0.75)',
    color: '#1a2d42',
    boxShadow: '0 2px 10px rgba(30,80,140,0.12)',
  },
};
