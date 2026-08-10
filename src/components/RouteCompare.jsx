import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, GitCompareArrows, Layers } from 'lucide-react';
import RouteMap from './RouteMap.jsx';
import { formatDistance, formatDuration, formatSpeed, formatDateTime, tripStats } from '../services/geoUtils.js';
import { compareToReference, groupLabel, groupTrips, trackColor, DEVIATION_M } from '../services/routeGroups.js';
import { softCard, ghostButton, label, value } from './driveUi.js';

/**
 * Vergleicht Fahrten derselben Strecke: welche Route wurde wann gefahren,
 * wo verlief sie anders und was hat das gekostet.
 */
export default function RouteCompare({ trips }) {
  const groups = useMemo(() => groupTrips(trips), [trips]);
  const [openId, setOpenId] = useState(null);

  const group = groups.find(g => g.id === openId) || null;

  if (groups.length === 0) {
    return (
      <div style={s.empty}>
        <Layers size={32} style={{ opacity: 0.4 }} />
        <p style={s.emptyTitle}>Noch nichts zu vergleichen</p>
        <p style={s.emptyText}>
          Sobald du dieselbe Strecke zweimal aufgezeichnet hast, zeigt die App hier, wo die Routen auseinanderlaufen.
        </p>
      </div>
    );
  }

  if (group) return <GroupDetail group={group} onBack={() => setOpenId(null)} />;

  return (
    <div style={s.wrap}>
      {groups.map(g => (
        <button key={g.id} style={s.item} onClick={() => setOpenId(g.id)}>
          <div style={s.thumb}>
            <RouteMap
              tracks={g.trips.slice(0, 4).map((t, i) => ({ points: t.points, color: trackColor(i) }))}
              height={72}
              compact
            />
          </div>
          <div style={s.info}>
            <span style={s.itemTitle}>{groupLabel(g)}</span>
            <span style={s.itemMeta}>
              {g.count} {g.count === 1 ? 'Fahrt' : 'Fahrten'} · zuletzt {formatDateTime(g.lastDrivenAt).split(',')[0]}
            </span>
            <span style={s.itemStats}>
              {g.minDistance === g.maxDistance
                ? formatDistance(g.minDistance)
                : `${formatDistance(g.minDistance)} – ${formatDistance(g.maxDistance)}`}
              {' · '}
              {g.minDuration === g.maxDuration
                ? formatDuration(g.minDuration)
                : `${formatDuration(g.minDuration)} – ${formatDuration(g.maxDuration)}`}
            </span>
          </div>
          <ChevronRight size={18} style={{ color: 'rgba(30,60,100,0.4)', flexShrink: 0 }} />
        </button>
      ))}
    </div>
  );
}

function GroupDetail({ group, onBack }) {
  const [referenceId, setReferenceId] = useState(group.trips[0].id);
  const reference = group.trips.find(t => t.id === referenceId) || group.trips[0];

  const rows = useMemo(
    () => group.trips.map((trip, i) => ({
      trip,
      color: trackColor(i),
      stats: tripStats(trip),
      diff: trip.id === reference.id ? null : compareToReference(trip, reference),
    })),
    [group.trips, reference]
  );

  const fastest = Math.min(...rows.map(r => r.stats.durationMs).filter(d => d > 0));
  const shortest = Math.min(...rows.map(r => r.stats.distance));

  // Abweichende Abschnitte liegen als breite Spur unter den Routen
  const tracks = [
    ...rows.flatMap(r => (r.diff?.segments || []).map(seg => ({
      points: seg.points, color: '#f59e0b', width: 2.6, opacity: 0.55, overlay: true,
    }))),
    ...rows.map(r => ({ points: r.trip.points, color: r.color })),
  ];

  return (
    <div style={s.wrap}>
      <button style={s.back} onClick={onBack}>
        <ChevronLeft size={18} /> Alle Strecken
      </button>

      <h2 style={s.title}>{groupLabel(group)}</h2>
      <p style={s.subtitle}>{group.count} Fahrten übereinandergelegt</p>

      <RouteMap tracks={tracks} height={320} />

      <p style={s.mapHint}>
        Orange hinterlegt: Abschnitte, auf denen eine Fahrt mehr als {DEVIATION_M} m von der Vergleichsfahrt abwich.
      </p>

      <div style={s.refRow}>
        <span style={label}>Vergleichsfahrt</span>
        <select value={referenceId} onChange={e => setReferenceId(e.target.value)} style={s.select}>
          {group.trips.map(t => (
            <option key={t.id} value={t.id}>
              {t.title || formatDateTime(t.startedAt)}
            </option>
          ))}
        </select>
      </div>

      {rows.map(r => {
        const isRef = r.trip.id === reference.id;
        return (
          <div key={r.trip.id} style={{ ...s.row, ...(isRef ? s.rowRef : null) }}>
            <div style={s.rowHead}>
              <span style={{ ...s.swatch, background: r.color }} />
              <span style={s.rowTitle}>{r.trip.title || formatDateTime(r.trip.startedAt)}</span>
              {isRef && <span style={s.tag}>Vergleichsfahrt</span>}
            </div>

            <div style={s.rowStats}>
              <Metric
                label="Strecke"
                text={formatDistance(r.stats.distance)}
                best={r.stats.distance === shortest}
              />
              <Metric
                label="Dauer"
                text={formatDuration(r.stats.durationMs)}
                best={r.stats.durationMs === fastest}
              />
              <Metric label="Ø Tempo" text={formatSpeed(r.stats.avgSpeed)} />
            </div>

            {r.diff && (
              <div style={s.diff}>
                {r.diff.segments.length === 0 ? (
                  <span style={s.diffSame}>
                    <GitCompareArrows size={14} /> Praktisch dieselbe Route
                  </span>
                ) : (
                  <>
                    <span style={s.diffHead}>
                      <GitCompareArrows size={14} />
                      {Math.round(r.diff.sharedRatio * 100)} % gemeinsame Strecke ·
                      {' '}max. {formatDistance(r.diff.maxDeviationM)} Abstand
                    </span>
                    <ul style={s.segList}>
                      {r.diff.segments.slice(0, 5).map((seg, i) => (
                        <li key={i} style={s.segItem}>
                          Andere Route ab km {seg.fromKm.toFixed(0)} bis km {seg.toKm.toFixed(0)}
                          {' '}({formatDistance(seg.maxM)} abseits)
                        </li>
                      ))}
                      {r.diff.segments.length > 5 && (
                        <li style={s.segItem}>… und {r.diff.segments.length - 5} weitere Abschnitte</li>
                      )}
                    </ul>
                  </>
                )}
              </div>
            )}

            {r.stats.gaps.length > 0 && (
              <p style={s.gapNote}>
                {r.stats.gaps.length} {r.stats.gaps.length === 1 ? 'Aufzeichnungslücke' : 'Aufzeichnungslücken'}
                {' '}({formatDistance(r.stats.gapMeters)} überbrückt) — dort ist die Route geschätzt.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Metric({ label: text, text: val, best = false }) {
  return (
    <div style={s.metric}>
      <span style={label}>{text}</span>
      <span style={{ ...value, fontSize: '1.05rem', color: best ? '#15803d' : '#1a2d42' }}>{val}</span>
    </div>
  );
}

const s = {
  wrap: { display: 'flex', flexDirection: 'column', gap: '0.6rem' },
  back: {
    ...ghostButton,
    alignSelf: 'flex-start',
    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
    padding: '0.5rem 0.9rem', fontSize: '0.88rem',
  },
  title: { fontSize: '1.2rem', fontWeight: 700, color: '#1a2d42', letterSpacing: '-0.02em' },
  subtitle: { fontSize: '0.82rem', color: 'rgba(30,70,120,0.6)', marginTop: '-0.4rem' },
  mapHint: { fontSize: '0.75rem', color: 'rgba(30,70,120,0.6)', lineHeight: 1.45 },
  refRow: { ...softCard, display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.7rem 0.9rem' },
  select: {
    flex: 1, minWidth: 0,
    background: 'rgba(255,255,255,0.65)',
    border: '1px solid rgba(255,255,255,0.75)',
    borderRadius: '10px', padding: '0.5rem 0.6rem',
    fontSize: '0.9rem', fontFamily: 'inherit', color: '#1a2d42', outline: 'none',
  },
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
  row: { ...softCard, display: 'flex', flexDirection: 'column', gap: '0.55rem', padding: '0.85rem 1rem' },
  rowRef: { border: '1px solid rgba(37,99,235,0.35)', background: 'rgba(255,255,255,0.58)' },
  rowHead: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  swatch: { width: '12px', height: '12px', borderRadius: '3px', flexShrink: 0 },
  rowTitle: { fontSize: '0.95rem', fontWeight: 600, color: '#1a2d42', flex: 1, minWidth: 0 },
  tag: {
    fontSize: '0.68rem', fontWeight: 600, color: '#1d4ed8',
    background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.2)',
    borderRadius: '999px', padding: '0.15rem 0.5rem', whiteSpace: 'nowrap',
  },
  rowStats: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem' },
  metric: { display: 'flex', flexDirection: 'column', gap: '0.15rem' },
  diff: {
    display: 'flex', flexDirection: 'column', gap: '0.3rem',
    borderTop: '1px solid rgba(30,80,140,0.12)', paddingTop: '0.55rem',
  },
  diffHead: {
    display: 'inline-flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap',
    fontSize: '0.82rem', fontWeight: 600, color: '#b45309',
  },
  diffSame: {
    display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
    fontSize: '0.82rem', fontWeight: 600, color: '#15803d',
  },
  segList: { listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.15rem' },
  segItem: { fontSize: '0.8rem', color: 'rgba(30,60,100,0.8)', lineHeight: 1.4 },
  gapNote: { fontSize: '0.75rem', color: 'rgba(180,83,9,0.9)', lineHeight: 1.4 },
  empty: {
    ...softCard,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
    padding: '2.5rem 1.5rem', textAlign: 'center', color: '#1a2d42',
  },
  emptyTitle: { fontSize: '1rem', fontWeight: 600 },
  emptyText: { fontSize: '0.85rem', color: 'rgba(30,70,120,0.65)', lineHeight: 1.5, maxWidth: '280px' },
};
