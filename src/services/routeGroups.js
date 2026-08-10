import { distanceMeters, tripStats } from './geoUtils.js';
import { distanceToTrack } from './simplify.js';

/** Start und Ziel gelten als "derselbe Ort", wenn sie so nah beieinander liegen. */
const SAME_PLACE_M = 3000;
/** Ab dieser Entfernung von der Vergleichsfahrt zählt ein Stück als andere Route. */
export const DEVIATION_M = 300;

function endpoints(trip) {
  const points = trip.points || [];
  return { from: points[0], to: points[points.length - 1] };
}

function sameRoute(a, b) {
  const ea = endpoints(a);
  const eb = endpoints(b);
  if (!ea.from || !ea.to || !eb.from || !eb.to) return false;
  return distanceMeters(ea.from, eb.from) <= SAME_PLACE_M
    && distanceMeters(ea.to, eb.to) <= SAME_PLACE_M;
}

/**
 * Bündelt Fahrten mit gleichem Start und Ziel zu Strecken.
 * Richtungsabhängig: Hin- und Rückweg sind zwei verschiedene Strecken.
 */
export function groupTrips(trips) {
  const groups = [];

  for (const trip of trips) {
    if (!trip.points || trip.points.length < 2) continue;
    const group = groups.find(g => sameRoute(g.trips[0], trip));
    if (group) group.trips.push(trip);
    else groups.push({ trips: [trip] });
  }

  return groups
    .map(g => {
      // Namen von der Fahrt nehmen, bei der das Reverse-Geocoding geklappt hat
      const named = g.trips.find(t => t.fromName || t.toName) || g.trips[0];
      const stats = g.trips.map(t => tripStats(t));
      const distances = stats.map(s => s.distance);
      const durations = stats.map(s => s.durationMs).filter(d => d != null);
      return {
        id: g.trips[0].id,
        trips: g.trips.slice().sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0)),
        fromName: named.fromName || null,
        toName: named.toName || null,
        count: g.trips.length,
        minDistance: Math.min(...distances),
        maxDistance: Math.max(...distances),
        minDuration: durations.length > 0 ? Math.min(...durations) : null,
        maxDuration: durations.length > 0 ? Math.max(...durations) : null,
        lastDrivenAt: Math.max(...g.trips.map(t => t.startedAt || 0)),
      };
    })
    .sort((a, b) => b.count - a.count || b.lastDrivenAt - a.lastDrivenAt);
}

export function groupLabel(group) {
  if (group.fromName || group.toName) {
    return `${group.fromName || 'Start'} → ${group.toName || 'Ziel'}`;
  }
  return `${group.count} Fahrten auf gleicher Strecke`;
}

/**
 * Punkte in etwa gleichmäßigem Abstand — begrenzt den Rechenaufwand
 * des Vergleichs auf Langstrecken.
 */
function sampleByDistance(points, stepM) {
  if (points.length === 0) return [];
  const out = [{ point: points[0], km: 0 }];
  let acc = 0;
  let sinceLast = 0;

  for (let i = 1; i < points.length; i++) {
    const d = distanceMeters(points[i - 1], points[i]);
    acc += d;
    sinceLast += d;
    if (sinceLast >= stepM) {
      out.push({ point: points[i], km: acc / 1000 });
      sinceLast = 0;
    }
  }
  return out;
}

/**
 * Vergleicht eine Fahrt mit einer Referenzfahrt und liefert die Abschnitte,
 * auf denen sie tatsächlich anders verlaufen ist — genau die Stellen, an
 * denen das Navi anders geführt hat.
 */
export function compareToReference(trip, reference, { thresholdM = DEVIATION_M, stepM = 200 } = {}) {
  const refPoints = reference?.points || [];
  const samples = sampleByDistance(trip.points || [], stepM);
  if (refPoints.length < 2 || samples.length === 0) {
    return { sharedRatio: 1, maxDeviationM: 0, segments: [], deviatingKm: 0 };
  }

  const marks = samples.map(({ point, km }) => ({
    km,
    point,
    dist: distanceToTrack(point, refPoints),
  }));

  let maxDeviationM = 0;
  let deviatingSamples = 0;
  const segments = [];
  let open = null;

  for (const mark of marks) {
    maxDeviationM = Math.max(maxDeviationM, mark.dist);
    const off = mark.dist > thresholdM;
    if (off) deviatingSamples++;

    if (off && !open) {
      open = { fromKm: mark.km, toKm: mark.km, maxM: mark.dist, point: mark.point, points: [mark.point] };
    } else if (off && open) {
      open.toKm = mark.km;
      open.points.push(mark.point);
      if (mark.dist > open.maxM) {
        open.maxM = mark.dist;
        open.point = mark.point;
      }
    } else if (!off && open) {
      segments.push(open);
      open = null;
    }
  }
  if (open) segments.push(open);

  return {
    sharedRatio: 1 - deviatingSamples / marks.length,
    maxDeviationM,
    // Sehr kurze Ausschläge sind meist GPS-Rauschen, keine andere Route
    segments: segments.filter(seg => seg.toKm - seg.fromKm >= 0.4),
    deviatingKm: segments.reduce((sum, seg) => sum + (seg.toKm - seg.fromKm), 0),
  };
}

/** Farben für die überlagerten Routen — deutlich unterscheidbar. */
const TRACK_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2'];

export function trackColor(index) {
  return TRACK_COLORS[index % TRACK_COLORS.length];
}
