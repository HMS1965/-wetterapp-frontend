import { useMemo } from 'react';
import { gapFlags } from '../services/geoUtils.js';

const VIEW = 1000;

/** Web-Mercator, damit die Route auch in nördlichen Breiten formtreu bleibt. */
function project(p) {
  const lat = Math.max(-85, Math.min(85, p.lat));
  const rad = (lat * Math.PI) / 180;
  return { x: p.lon, y: -Math.log(Math.tan(Math.PI / 4 + rad / 2)) * (180 / Math.PI) };
}

/** Zerlegt eine Spur an Aufzeichnungslücken, damit sie nicht als Gerade durchgezogen wird. */
function splitAtGaps(points) {
  const flags = gapFlags(points);
  const chunks = [];
  let current = [];
  for (let i = 0; i < points.length; i++) {
    if (flags[i]) {
      chunks.push(current);
      current = [];
    }
    current.push(points[i]);
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Zeichnet eine oder mehrere Strecken als Linien — ohne Kartenkacheln,
 * damit die Ansicht auch ohne Netz funktioniert.
 *
 * `tracks` überlagert mehrere Fahrten zum Vergleich; `points` ist die
 * Kurzform für eine einzelne Fahrt. `compact` ist für kleine Vorschauen.
 */
export default function RouteMap({
  points = null, tracks = null, height = 240, live = false, compact = false,
}) {
  const list = useMemo(
    () => (tracks && tracks.length > 0 ? tracks : points ? [{ points, color: '#2563eb' }] : []),
    [tracks, points]
  );

  // Unten mehr Luft lassen, damit die Legende die Route nicht überdeckt
  const pad = compact ? { t: 90, r: 90, b: 90, l: 90 } : { t: 45, r: 45, b: 150, l: 45 };
  const stroke = compact
    ? { halo: 70, line: 40, markerOuter: 0, markerInner: 55 }
    : { halo: 22, line: 12, markerOuter: 20, markerInner: 13 };

  const shape = useMemo(() => {
    const all = list.flatMap(t => t.points || []);
    if (all.length === 0) return null;

    const projected = all.map(project);
    const minX = Math.min(...projected.map(p => p.x));
    const maxX = Math.max(...projected.map(p => p.x));
    const minY = Math.min(...projected.map(p => p.y));
    const maxY = Math.max(...projected.map(p => p.y));

    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const availW = VIEW - pad.l - pad.r;
    const availH = VIEW - pad.t - pad.b;

    // Gerade Nord-Süd-/Ost-West-Strecken haben eine Spanne von 0 — dann zählt die andere Achse
    const scaleX = spanX > 0 ? availW / spanX : Infinity;
    const scaleY = spanY > 0 ? availH / spanY : Infinity;
    const scale = Number.isFinite(Math.min(scaleX, scaleY)) ? Math.min(scaleX, scaleY) : 1;

    const offsetX = pad.l + (availW - spanX * scale) / 2;
    const offsetY = pad.t + (availH - spanY * scale) / 2;
    const toXY = p => {
      const q = project(p);
      return { x: offsetX + (q.x - minX) * scale, y: offsetY + (q.y - minY) * scale };
    };
    const toPath = chunk => chunk
      .map(toXY)
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' ');

    const drawn = list
      .filter(t => (t.points || []).length > 0)
      .map(t => {
        const chunks = splitAtGaps(t.points);
        return {
          color: t.color || '#2563eb',
          overlay: !!t.overlay,
          width: t.width ?? 1,
          opacity: t.opacity ?? null,
          paths: chunks.filter(c => c.length > 1).map(toPath),
          // Lücken als gestrichelte Verbindung: sichtbar, aber klar als Schätzung erkennbar
          bridges: chunks.slice(1).map((chunk, i) => {
            const a = toXY(chunks[i][chunks[i].length - 1]);
            const b = toXY(chunk[0]);
            return `M${a.x.toFixed(1)},${a.y.toFixed(1)} L${b.x.toFixed(1)},${b.y.toFixed(1)}`;
          }),
          start: toXY(t.points[0]),
          end: toXY(t.points[t.points.length - 1]),
          single: t.points.length === 1,
        };
      });

    return { drawn };
  }, [list, pad.t, pad.r, pad.b, pad.l]);

  if (!shape) {
    return (
      <div style={{ ...s.empty, height, fontSize: compact ? '0.7rem' : '0.9rem' }}>
        {live ? 'Warte auf GPS …' : 'Keine Punkte'}
      </div>
    );
  }

  const multi = list.filter(t => !t.overlay).length > 1;
  const endColor = live ? '#2563eb' : '#dc2626';

  return (
    <div style={{ ...s.wrap, height }}>
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} preserveAspectRatio="xMidYMid meet" style={s.svg}>
        {shape.drawn.map((track, i) => (
          <g key={i}>
            {!multi && track.paths.map((d, j) => (
              <path key={`h${j}`} d={d} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={stroke.halo}
                strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {track.bridges.map((d, j) => (
              <path key={`b${j}`} d={d} fill="none" stroke={track.color} strokeWidth={stroke.line * 0.6 * track.width}
                strokeDasharray={`${stroke.line * 1.5} ${stroke.line * 1.5}`} opacity="0.5" strokeLinecap="round" />
            ))}
            {track.paths.map((d, j) => (
              <path key={`p${j}`} d={d} fill="none" stroke={track.color} strokeWidth={stroke.line * track.width}
                strokeLinecap="round" strokeLinejoin="round" opacity={track.opacity ?? (multi ? 0.85 : 1)} />
            ))}
          </g>
        ))}

        {!multi && shape.drawn.map((track, i) => (
          <g key={`m${i}`}>
            {!track.single && (
              <>
                {stroke.markerOuter > 0 && <circle cx={track.start.x} cy={track.start.y} r={stroke.markerOuter} fill="#fff" />}
                <circle cx={track.start.x} cy={track.start.y} r={stroke.markerInner} fill="#16a34a" />
              </>
            )}
            {stroke.markerOuter > 0 && <circle cx={track.end.x} cy={track.end.y} r={stroke.markerOuter} fill="#fff" />}
            <circle cx={track.end.x} cy={track.end.y} r={stroke.markerInner} fill={endColor}>
              {live && <animate attributeName="r"
                values={`${stroke.markerInner};${stroke.markerInner + 4};${stroke.markerInner}`}
                dur="1.6s" repeatCount="indefinite" />}
            </circle>
          </g>
        ))}
      </svg>

      {!compact && !multi && shape.drawn[0] && !shape.drawn[0].single && (
        <div style={s.legend}>
          <span style={s.legendItem}><span style={{ ...s.dot, background: '#16a34a' }} />Start</span>
          <span style={s.legendItem}><span style={{ ...s.dot, background: endColor }} />{live ? 'Aktuell' : 'Ziel'}</span>
        </div>
      )}
    </div>
  );
}

const s = {
  wrap: {
    position: 'relative',
    width: '100%',
    background: 'rgba(255,255,255,0.35)',
    border: '1px solid rgba(255,255,255,0.70)',
    borderRadius: '18px',
    overflow: 'hidden',
  },
  svg: { width: '100%', height: '100%', display: 'block' },
  empty: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '100%',
    background: 'rgba(255,255,255,0.30)',
    border: '1px dashed rgba(255,255,255,0.80)',
    borderRadius: '18px',
    color: 'rgba(30,60,100,0.55)', textAlign: 'center', padding: '0 0.5rem',
  },
  legend: {
    position: 'absolute', bottom: '0.6rem', left: '0.75rem',
    display: 'flex', gap: '0.9rem',
    fontSize: '0.72rem', color: 'rgba(20,50,90,0.75)', fontWeight: 500,
  },
  legendItem: { display: 'flex', alignItems: 'center', gap: '0.3rem' },
  dot: { width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block' },
};
