import { markGaps, pathLength, tripStats } from './geoUtils.js';
import { simplifyTrip } from './simplify.js';
import { newTripId } from './tripStore.js';

/**
 * Liest eine GPX-Datei ein — das Format, das jede GPS-Logger-App exportiert.
 * Damit lassen sich auch Fahrten auswerten, die eine andere App aufgezeichnet
 * hat, etwa eine, die im Standby weiterläuft.
 *
 * Mehrere <trkseg> bedeuten Aufzeichnungslücken; die bleiben als solche erhalten.
 */
export function parseGpx(xmlText, { fileName = 'Import' } = {}) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('Die Datei ist kein lesbares GPX.');
  }

  const segments = [...doc.getElementsByTagName('trkseg')];
  // Manche Apps schreiben Routen oder nur einzelne Wegpunkte statt eines Tracks
  const containers = segments.length > 0 ? segments : [...doc.getElementsByTagName('rte')];
  const source = containers.length > 0 ? containers : [doc.documentElement];

  const chunks = [];
  for (const container of source) {
    const nodes = [
      ...container.getElementsByTagName('trkpt'),
      ...container.getElementsByTagName('rtept'),
      ...(containers.length > 0 ? [] : [...container.getElementsByTagName('wpt')]),
    ];
    const chunk = [];
    for (const node of nodes) {
      const lat = Number(node.getAttribute('lat'));
      const lon = Number(node.getAttribute('lon'));
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const timeText = node.getElementsByTagName('time')[0]?.textContent;
      const t = timeText ? Date.parse(timeText) : NaN;
      const speedText = node.getElementsByTagName('speed')[0]?.textContent;
      const speed = speedText ? Number(speedText) : null;
      chunk.push({
        lat, lon,
        t: Number.isFinite(t) ? t : null,
        speed: Number.isFinite(speed) ? speed : null,
      });
    }
    if (chunk.length > 0) chunks.push(chunk);
  }

  const flat = chunks.flat();
  if (flat.length < 2) throw new Error('In der Datei stecken keine zwei Wegpunkte.');

  const timesKnown = flat.every(p => p.t != null);
  let points;
  if (timesKnown) {
    points = flat;
  } else {
    // Ohne Zeitstempel bleibt die Route auswertbar, Dauer und Tempo aber nicht
    const base = Date.now();
    let index = 0;
    points = chunks.flatMap((chunk, chunkIndex) => chunk.map(p => ({
      ...p,
      // Segmentgrenzen als Lücke markieren, damit sie nicht durchgezogen werden
      t: base + index++ * 1000 + chunkIndex * 120000,
    })));
  }

  const startedAt = points[0].t;
  const endedAt = points[points.length - 1].t;
  const marked = markGaps(points);
  const name = doc.getElementsByTagName('name')[0]?.textContent?.trim();

  const trip = {
    id: newTripId(),
    title: name || fileName.replace(/\.gpx$/i, ''),
    startedAt,
    endedAt,
    resumedAt: null,
    movingMs: timesKnown ? endedAt - startedAt : null,
    timesUnknown: !timesKnown,
    distanceM: pathLength(points),
    rawPointCount: points.length,
    importedFrom: 'gpx',
    points: marked,
  };
  trip.maxSpeedMps = timesKnown ? tripStats(trip).maxSpeed : null;
  trip.points = simplifyTrip(marked, { tolerance: 8 });
  return trip;
}
