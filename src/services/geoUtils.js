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

/**
 * Entscheidet, ob ein neuer GPS-Punkt zur Route gehört.
 * Filtert Messrauschen im Stand und offensichtliche Ausreißer.
 */
export function shouldKeepPoint(last, next, { minDistance = 12, maxAccuracy = 60, maxSpeedMps = 70 } = {}) {
  if (next.accuracy != null && next.accuracy > maxAccuracy) return false;
  if (!last) return true;

  const dist = distanceMeters(last, next);
  if (dist < minDistance) return false;

  const dt = (next.t - last.t) / 1000;
  // Sprung auf einen physikalisch unmöglichen Punkt (GPS-Teleport) verwerfen
  if (dt > 0 && dist / dt > maxSpeedMps) return false;

  return true;
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

/** Fahrtstatistik aus den aufgezeichneten Punkten. */
export function tripStats(trip) {
  const points = trip?.points ?? [];
  const distance = pathLength(points);
  const startedAt = trip?.startedAt ?? points[0]?.t ?? null;
  const endedAt = trip?.endedAt ?? points[points.length - 1]?.t ?? null;
  const movingMs = trip?.movingMs ?? (startedAt && endedAt ? endedAt - startedAt : 0);
  const avgSpeed = movingMs > 0 ? distance / (movingMs / 1000) : 0;

  let maxSpeed = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (typeof p.speed === 'number' && p.speed >= 0) {
      maxSpeed = Math.max(maxSpeed, p.speed);
    } else if (i > 0) {
      const speed = segmentSpeed(points[i - 1], p);
      if (speed != null) maxSpeed = Math.max(maxSpeed, speed);
    }
  }

  return {
    distance,
    durationMs: movingMs,
    avgSpeed,
    maxSpeed,
    startedAt,
    endedAt,
    pointCount: points.length,
  };
}

export function formatDistance(meters) {
  if (!meters || meters < 1000) return `${Math.round(meters || 0)} m`;
  return `${(meters / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.round((ms || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function formatSpeed(mps) {
  return `${Math.round((mps || 0) * 3.6)} km/h`;
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
