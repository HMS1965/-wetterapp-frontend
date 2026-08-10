import { distanceMeters, gapFlags } from './geoUtils.js';

/**
 * Abstand eines Punktes von der Strecke a–b in Metern.
 * Lokale, äquirektanguläre Projektion — auf wenigen Kilometern genau genug.
 */
function perpendicularDistance(p, a, b) {
  const latRef = (a.lat * Math.PI) / 180;
  const mPerDegLat = 111132;
  const mPerDegLon = 111320 * Math.cos(latRef);

  const ax = 0;
  const ay = 0;
  const bx = (b.lon - a.lon) * mPerDegLon;
  const by = (b.lat - a.lat) * mPerDegLat;
  const px = (p.lon - a.lon) * mPerDegLon;
  const py = (p.lat - a.lat) * mPerDegLat;

  const segLenSq = (bx - ax) ** 2 + (by - ay) ** 2;
  if (segLenSq === 0) return Math.hypot(px, py);

  const t = Math.max(0, Math.min(1, (px * bx + py * by) / segLenSq));
  return Math.hypot(px - t * bx, py - t * by);
}

/**
 * Ramer-Douglas-Peucker: entfernt Punkte, die auf einer Geraden liegen,
 * und behält Kurven und Abzweigungen. Iterativ, damit auch zehntausende
 * Punkte einer Langstrecke keinen Stack-Overflow auslösen.
 */
export function simplifyTrack(points, tolerance = 10) {
  if (points.length <= 2) return points.slice();

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop();
    let maxDist = 0;
    let index = -1;

    for (let i = first + 1; i < last; i++) {
      const dist = perpendicularDistance(points[i], points[first], points[last]);
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }

    if (index !== -1 && maxDist > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  return points.filter((_, i) => keep[i] === 1);
}

/**
 * Vereinfacht die Fahrt fürs Archiv, lässt Punkte an Aufzeichnungslücken
 * aber unangetastet — sonst würde eine Lücke zur scheinbaren Geraden.
 */
export function simplifyTrip(points, { tolerance = 10 } = {}) {
  if (points.length <= 2) return points.slice();

  const flags = gapFlags(points);
  const chunks = [];
  let current = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (flags[i]) {
      chunks.push(current);
      current = [];
    }
    current.push(points[i]);
  }
  chunks.push(current);

  return chunks.flatMap(chunk => simplifyTrack(chunk, tolerance));
}

/**
 * Kleinster Abstand eines Punktes zu einer ganzen Route in Metern.
 * Für den Routenvergleich: wie weit lief diese Fahrt von jener weg?
 */
export function distanceToTrack(point, track) {
  if (!track || track.length === 0) return Infinity;
  if (track.length === 1) return distanceMeters(point, track[0]);

  const M_PER_DEG_LAT = 111132;
  const mPerDegLon = 111320 * Math.cos((point.lat * Math.PI) / 180);

  let min = Infinity;
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1];
    const b = track[i];

    // Segmente, die komplett jenseits des bisherigen Minimums liegen, überspringen.
    // Nur gültig, wenn beide Enden auf derselben Seite liegen — sonst kreuzt das Segment.
    const la = (a.lat - point.lat) * M_PER_DEG_LAT;
    const lb = (b.lat - point.lat) * M_PER_DEG_LAT;
    if ((la > min && lb > min) || (la < -min && lb < -min)) continue;
    const oa = (a.lon - point.lon) * mPerDegLon;
    const ob = (b.lon - point.lon) * mPerDegLon;
    if ((oa > min && ob > min) || (oa < -min && ob < -min)) continue;

    const d = perpendicularDistance(point, a, b);
    if (d < min) min = d;
    if (min === 0) break;
  }
  return min;
}
