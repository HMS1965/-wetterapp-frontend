const TRIPS_KEY = 'fahrtenrekorder.trips.v1';
const ACTIVE_KEY = 'fahrtenrekorder.active.v1';

/**
 * Punkte werden kompakt als Zahlen-Array abgelegt: [lat, lon, dt, speed, gapSec].
 * Eine 250-km-Fahrt hat je nach Strecke einige tausend Punkte — als
 * Objekt-Array wäre der localStorage nach wenigen Fahrten voll.
 * Fünf Nachkommastellen entsprechen gut einem Meter, das reicht für eine Route.
 */
function encodePoints(points, startedAt) {
  return points.map(p => {
    const base = [
      Number(p.lat.toFixed(5)),
      Number(p.lon.toFixed(5)),
      Math.round((p.t - startedAt) / 1000),
      p.speed == null ? null : Number(p.speed.toFixed(1)),
    ];
    // Fünftes Feld nur setzen, wo tatsächlich eine Lücke war
    return p.gapMs ? [...base, Math.round(p.gapMs / 1000)] : base;
  });
}

function decodePoints(encoded, startedAt) {
  return encoded.map(([lat, lon, dt, speed, gapSec]) => ({
    lat, lon, speed: speed ?? null, t: startedAt + dt * 1000,
    gapMs: (gapSec ?? 0) * 1000,
  }));
}

function encodeTrip(trip) {
  const { points, ...rest } = trip;
  return { ...rest, v: 2, pts: encodePoints(points, trip.startedAt) };
}

function decodeTrip(stored) {
  if (!stored) return null;
  if (stored.v === 2 && Array.isArray(stored.pts)) {
    const { pts, ...rest } = stored;
    return { ...rest, points: decodePoints(pts, stored.startedAt) };
  }
  // Fahrten aus der ersten Fassung liegen noch als Objekt-Array vor
  return Array.isArray(stored.points) ? stored : null;
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Speicher voll oder localStorage gesperrt (z.B. Privatmodus)
    return false;
  }
}

/** Alle gespeicherten Fahrten, neueste zuerst. */
export function loadTrips() {
  const stored = read(TRIPS_KEY, []);
  if (!Array.isArray(stored)) return [];
  return stored
    .map(decodeTrip)
    .filter(Boolean)
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
}

export function saveTrip(trip) {
  const stored = read(TRIPS_KEY, []).filter(t => t.id !== trip.id);
  stored.push(encodeTrip(trip));
  return write(TRIPS_KEY, stored);
}

export function deleteTrip(id) {
  write(TRIPS_KEY, read(TRIPS_KEY, []).filter(t => t.id !== id));
}

/** Speichert das ausgewertete Straßenprotokoll an der Fahrt. */
export function saveRoadLog(id, roadLog) {
  const stored = read(TRIPS_KEY, []);
  const trip = stored.find(t => t.id === id);
  if (!trip) return false;
  trip.roadLog = roadLog;
  return write(TRIPS_KEY, stored);
}

export function renameTrip(id, title) {
  const stored = read(TRIPS_KEY, []);
  const trip = stored.find(t => t.id === id);
  if (!trip) return;
  trip.title = title;
  write(TRIPS_KEY, stored);
}

/**
 * Die laufende Aufzeichnung wird separat gesichert, damit ein Reload
 * oder ein Absturz der App die Fahrt nicht verliert.
 */
export function loadActiveTrip() {
  const trip = decodeTrip(read(ACTIVE_KEY, null));
  return trip && Array.isArray(trip.points) ? trip : null;
}

export function persistActiveTrip(trip) {
  return write(ACTIVE_KEY, encodeTrip(trip));
}

export function clearActiveTrip() {
  write(ACTIVE_KEY, null);
}

export function newTripId() {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Sicherung des ganzen Fahrtenbuchs. Die Fahrten liegen nur lokal im Browser —
 * wer Browserdaten löscht oder das Gerät wechselt, verliert sie sonst. Bei
 * einer Strecke, die man einmal im Jahr fährt, ist das entscheidend.
 */
export function exportAll() {
  return JSON.stringify({
    format: 'fahrtenrekorder',
    version: 2,
    exportedAt: new Date().toISOString(),
    trips: read(TRIPS_KEY, []),
  }, null, 2);
}

/**
 * Spielt eine Sicherung ein und führt sie mit dem vorhandenen Bestand zusammen.
 * Fahrten mit gleicher ID werden nicht doppelt angelegt.
 */
export function importAll(json) {
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('Die Datei ist keine gültige Sicherung.');
  }
  if (!data || !Array.isArray(data.trips)) {
    throw new Error('In der Datei stecken keine Fahrten.');
  }

  const existing = read(TRIPS_KEY, []);
  const byId = new Map(existing.map(t => [t.id, t]));
  let added = 0;
  for (const trip of data.trips) {
    if (!trip?.id || byId.has(trip.id)) continue;
    // Nur einlesen, was auch als Fahrt durchgeht
    if (!Array.isArray(trip.pts) && !Array.isArray(trip.points)) continue;
    byId.set(trip.id, trip);
    added++;
  }

  if (!write(TRIPS_KEY, [...byId.values()])) {
    throw new Error('Der Speicher reicht nicht für alle Fahrten.');
  }
  return { added, total: byId.size };
}
