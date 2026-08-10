const TRIPS_KEY = 'fahrtenrekorder.trips.v1';
const ACTIVE_KEY = 'fahrtenrekorder.active.v1';

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
  const trips = read(TRIPS_KEY, []);
  return Array.isArray(trips) ? trips.slice().sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0)) : [];
}

export function saveTrip(trip) {
  const trips = read(TRIPS_KEY, []).filter(t => t.id !== trip.id);
  trips.push(trip);
  write(TRIPS_KEY, trips);
  return trip;
}

export function deleteTrip(id) {
  write(TRIPS_KEY, read(TRIPS_KEY, []).filter(t => t.id !== id));
}

export function renameTrip(id, title) {
  const trips = read(TRIPS_KEY, []);
  const trip = trips.find(t => t.id === id);
  if (!trip) return;
  trip.title = title;
  write(TRIPS_KEY, trips);
}

/**
 * Die laufende Aufzeichnung wird separat gesichert, damit ein Reload
 * oder ein Absturz der App die Fahrt nicht verliert.
 */
export function loadActiveTrip() {
  const trip = read(ACTIVE_KEY, null);
  return trip && Array.isArray(trip.points) ? trip : null;
}

export function persistActiveTrip(trip) {
  return write(ACTIVE_KEY, trip);
}

export function clearActiveTrip() {
  write(ACTIVE_KEY, null);
}

export function newTripId() {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
