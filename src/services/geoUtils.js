const EARTH_RADIUS_M = 6371000;

const toRad = deg => (deg * Math.PI) / 180;

/** Luftlinie zwischen zwei Punkten in Metern (Haversine). */
export function distanceMeters(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Summierte Streckenlänge aller Punkte in Metern. */
export function pathLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distanceMeters(points[i - 1], points[i]);
  }
  return total;
}

/** Richtung von a nach b in Grad (0 = Nord). */
export function bearing(a, b) {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Kleinster Winkel zwischen zwei Richtungen (0–180°). */
export function bearingDelta(a, b) {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Entscheidet, ob ein neuer GPS-Punkt zur Route gehört.
 * Filtert Messrauschen im Stand und offensichtliche Ausreißer.
 *
 * Der Mindestabstand wächst mit dem Tempo: auf der Autobahn genügt rund alle
 * zwei Sekunden ein Punkt, in der Stadt braucht es dichtere Punkte. Ohne das
 * käme eine 250-km-Fahrt auf über 20.000 Punkte und sprengt den Speicher.
 * `prev` ist der Punkt vor `last` — daraus erkennen wir Kurven, die trotz
 * kurzem Abstand aufgezeichnet werden müssen.
 */
export function shouldKeepPoint(last, next, {
  minDistance = 12,
  maxDistance = 80,
  intervalSec = 2,
  maxAccuracy = 60,
  maxSpeedMps = 70,
  turnDegrees = 25,
  prev = null,
} = {}) {
  if (next.accuracy != null && next.accuracy > maxAccuracy) return false;
  if (!last) return true;

  const dist = distanceMeters(last, next);
  const dt = (next.t - last.t) / 1000;

  // Sprung auf einen physikalisch unmöglichen Punkt (GPS-Teleport) verwerfen
  if (dt > 0 && dist / dt > maxSpeedMps) return false;

  const speed = typeof next.speed === 'number' && next.speed >= 0
    ? next.speed
    : dt > 0 ? dist / dt : 0;
  const threshold = Math.min(maxDistance, Math.max(minDistance, speed * intervalSec));

  if (dist >= threshold) return true;

  // Abbiegevorgänge sind für den Routenvergleich das Wichtigste — die
  // dürfen nicht am Mindestabstand scheitern.
  if (prev && dist >= minDistance && bearingDelta(bearing(prev, last), bearing(last, next)) >= turnDegrees) {
    return true;
  }

  return false;
}

/** Längere Lücken (Pause, Signalverlust) taugen nicht zur Tempo-Messung. */
const MAX_GAP_MS = 30000;

/**
 * Momentangeschwindigkeit zwischen zwei Punkten in m/s,
 * oder null, wenn die Lücke dazwischen zu groß ist.
 */
export function segmentSpeed(a, b) {
  if (!a || !b) return null;
  const dt = (b.t - a.t) / 1000;
  if (dt <= 0 || dt * 1000 > MAX_GAP_MS) return null;
  return distanceMeters(a, b) / dt;
}

/** Ab dieser Pause zwischen zwei Punkten gilt die Aufzeichnung als unterbrochen. */
export const GAP_MS = 60000;

/**
 * Unterbrechungen der Aufzeichnung — etwa weil der Browser die App in den
 * Hintergrund geschickt hat. Sie werden ausgewiesen statt stillschweigend
 * als Luftlinie durchgezogen.
 *
 * Ein `gapMs`-Vermerk am Punkt hat Vorrang: In der archivierten, ausgedünnten
 * Spur liegen auch reguläre Punkte auf langen Geraden weit auseinander, ohne
 * dass die Aufzeichnung je unterbrochen war.
 */
export function findGaps(points, gapMs = GAP_MS) {
  const flags = gapFlags(points, gapMs);
  const gaps = [];

  for (let i = 1; i < points.length; i++) {
    if (!flags[i]) continue;
    gaps.push({
      index: i,
      ms: points[i].gapMs ?? points[i].t - points[i - 1].t,
      meters: distanceMeters(points[i - 1], points[i]),
    });
  }
  return gaps;
}

/**
 * Pro Punkt: Lag davor eine Aufzeichnungslücke? Einzige Quelle der Wahrheit
 * für Statistik und Kartendarstellung.
 */
export function gapFlags(points, gapMs = GAP_MS) {
  const marked = points.some(p => p.gapMs != null);
  return points.map((p, i) => {
    if (i === 0) return false;
    const dt = marked ? (p.gapMs ?? 0) : p.t - points[i - 1].t;
    return dt > gapMs;
  });
}

/** Vermerkt an jedem Punkt, ob davor eine Aufzeichnungslücke lag. */
export function markGaps(points, gapMs = GAP_MS) {
  return points.map((p, i) => {
    if (i === 0) return { ...p, gapMs: 0 };
    const dt = points[i].t - points[i - 1].t;
    return { ...p, gapMs: dt > gapMs ? dt : 0 };
  });
}

/** Fahrtstatistik aus den aufgezeichneten Punkten. */
export function tripStats(trip) {
  const points = trip?.points ?? [];
  // Beim Abschluss aus den Rohdaten berechnet — die archivierte Spur ist
  // für den Speicher vereinfacht und läge sonst leicht darunter.
  const distance = trip?.distanceM ?? pathLength(points);
  const startedAt = trip?.startedAt ?? points[0]?.t ?? null;
  const endedAt = trip?.endedAt ?? points[points.length - 1]?.t ?? null;
  // Aus GPX ohne Zeitstempel importierte Fahrten haben keine belastbare Dauer
  const movingMs = trip?.timesUnknown
    ? null
    : trip?.movingMs ?? (startedAt && endedAt ? endedAt - startedAt : 0);
  const avgSpeed = movingMs == null ? null : movingMs > 0 ? distance / (movingMs / 1000) : 0;

  // null heißt "nicht bestimmbar" — etwa bei importierten Spuren, deren Punkte
  // zu weit auseinanderliegen. Dann ist "—" ehrlicher als "0 km/h".
  let maxSpeed = trip?.maxSpeedMps ?? null;
  if (trip?.timesUnknown) {
    maxSpeed = null;
  } else if (trip?.maxSpeedMps == null) {
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (typeof p.speed === 'number' && p.speed >= 0) {
        maxSpeed = Math.max(maxSpeed ?? 0, p.speed);
      } else if (i > 0) {
        const speed = segmentSpeed(points[i - 1], p);
        if (speed != null) maxSpeed = Math.max(maxSpeed ?? 0, speed);
      }
    }
  }

  const gaps = findGaps(points);

  return {
    distance,
    durationMs: movingMs,
    avgSpeed,
    maxSpeed,
    startedAt,
    endedAt,
    pointCount: points.length,
    gaps,
    gapMeters: gaps.reduce((sum, g) => sum + g.meters, 0),
  };
}

export function formatDistance(meters) {
  if (!meters || meters < 1000) return `${Math.round(meters || 0)} m`;
  return `${(meters / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

export function formatDuration(ms) {
  if (ms == null) return '—';
  const total = Math.max(0, Math.round((ms || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function formatSpeed(mps) {
  if (mps == null) return '—';
  return `${Math.round(mps * 3.6)} km/h`;
}

export function formatDateTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

export function formatCoords(p) {
  if (!p) return '—';
  return `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;
}

/** Fahrt als GPX-Track (öffnet sich in jeder Karten-/Fahrtenbuch-App). */
export function toGpx(trip) {
  const name = escapeXml(trip.title || 'Fahrt');
  const segments = trip.points
    .map(p => {
      const time = new Date(p.t).toISOString();
      const ele = p.altitude != null ? `<ele>${p.altitude.toFixed(1)}</ele>` : '';
      return `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">${ele}<time>${time}</time></trkpt>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Fahrtenrekorder" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${name}</name><time>${new Date(trip.startedAt).toISOString()}</time></metadata>
  <trk>
    <name>${name}</name>
    <trkseg>
${segments}
    </trkseg>
  </trk>
</gpx>
`;
}

/** Fahrt als GeoJSON-LineString. */
export function toGeoJson(trip) {
  return JSON.stringify(
    {
      type: 'Feature',
      properties: {
        name: trip.title || 'Fahrt',
        startedAt: trip.startedAt ? new Date(trip.startedAt).toISOString() : null,
        endedAt: trip.endedAt ? new Date(trip.endedAt).toISOString() : null,
      },
      geometry: {
        type: 'LineString',
        coordinates: trip.points.map(p => [Number(p.lon.toFixed(6)), Number(p.lat.toFixed(6))]),
      },
    },
    null,
    2
  );
}

export function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slugify(text) {
  return (text || 'fahrt')
    .toLowerCase()
    .replace(/[äöüß]/g, m => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[m])
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'fahrt';
}

function escapeXml(text) {
  return String(text).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);
}
