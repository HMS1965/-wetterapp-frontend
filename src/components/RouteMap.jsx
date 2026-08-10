import { useMemo } from 'react';

const VIEW = 1000;

/** Web-Mercator, damit die Route auch in nördlichen Breiten formtreu bleibt. */
function project(p) {
  const lat = Math.max(-85, Math.min(85, p.lat));
  const rad = (lat * Math.PI) / 180;
  return { x: p.lon, y: -Math.log(Math.tan(Math.PI / 4 + rad / 2)) * (180 / Math.PI) };
}

/**
 * Zeichnet die aufgezeichnete Strecke als Linie — ohne Kartenkacheln,
 * damit die Ansicht auch ohne Netz funktioniert.
 * `compact` ist für kleine Vorschauen: dickere Linien, keine Legende.
 */
export default function RouteMap({ points = [], height = 240, live = false, compact = false }) {
  // Unten mehr Luft lassen, damit die Legende die Route nicht überdeckt
  const pad = compact ? { t: 90, r: 90, b: 90, l: 90 } : { t: 45, r: 45, b: 150, l: 45 };
  const stroke = compact
    ? { halo: 70, line: 40, markerOuter: 0, markerInner: 55 }
    : { halo: 22, line: 12, markerOuter: 20, markerInner: 13 };

  const shape = useMemo(() => {
    if (points.length === 0) return null;

    const projected = points.map(project);
    const xs = projected.map(p => p.x);
    const ys = projected.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

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

    const mapped = projected.map(p => ({
      x: offsetX + (p.x - minX) * scale,
      y: offsetY + (p.y - minY) * scale,
    }));

    return {
      d: mapped.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
      start: mapped[0],
      end: mapped[mapped.length - 1],
    };
  }, [points, pad.t, pad.r, pad.b, pad.l]);

  if (!shape) {
    return (
      <div style={{ ...s.empty, height, fontSize: compact ? '0.7rem' : '0.9rem' }}>
        {live ? 'Warte auf GPS …' : 'Keine Punkte'}
      </div>
    );
  }

  const single = points.length === 1;
  const endColor = live ? '#2563eb' : '#dc2626';

  return (
    <div style={{ ...s.wrap, height }}>
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} preserveAspectRatio="xMidYMid meet" style={s.svg}>
        {!single && (
          <>
            <path d={shape.d} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={stroke.halo}
              strokeLinecap="round" strokeLinejoin="round" />
            <path d={shape.d} fill="none" stroke="#2563eb" strokeWidth={stroke.line}
              strokeLinecap="round" strokeLinejoin="round" />
            {stroke.markerOuter > 0 && <circle cx={shape.start.x} cy={shape.start.y} r={stroke.markerOuter} fill="#fff" />}
            <circle cx={shape.start.x} cy={shape.start.y} r={stroke.markerInner} fill="#16a34a" />
          </>
        )}
        {stroke.markerOuter > 0 && <circle cx={shape.end.x} cy={shape.end.y} r={stroke.markerOuter} fill="#fff" />}
        <circle cx={shape.end.x} cy={shape.end.y} r={stroke.markerInner} fill={endColor}>
          {live && <animate attributeName="r" values={`${stroke.markerInner};${stroke.markerInner + 4};${stroke.markerInner}`} dur="1.6s" repeatCount="indefinite" />}
        </circle>
      </svg>
      {!compact && !single && (
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
