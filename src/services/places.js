/**
 * Ortsnamen zu Koordinaten (Best Effort).
 * Schlägt die Auflösung fehl — kein Netz, Dienst nicht erreichbar —,
 * bleibt die Fahrt gültig und zeigt stattdessen die Koordinaten.
 */
const cache = new Map();

export async function resolvePlaceName(point, { timeout = 6000 } = {}) {
  if (!point) return null;
  const key = `${point.lat.toFixed(3)},${point.lon.toFixed(3)}`;
  if (cache.has(key)) return cache.get(key);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&accept-language=de&lat=${point.lat}&lon=${point.lon}`;
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('Reverse-Geocoding fehlgeschlagen');
    const data = await res.json();
    const a = data.address || {};
    const place = a.city || a.town || a.village || a.suburb || a.municipality || a.county || null;
    const street = a.road || null;
    const name = [street, place].filter(Boolean).join(', ') || data.name || null;
    cache.set(key, name);
    return name;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Link auf eine echte Karte — praktisch, um Start/Ziel nachzuschlagen. */
export function osmLink(point, zoom = 15) {
  if (!point) return null;
  return `https://www.openstreetmap.org/?mlat=${point.lat}&mlon=${point.lon}#map=${zoom}/${point.lat}/${point.lon}`;
}
