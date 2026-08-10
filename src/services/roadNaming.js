import { distanceMeters } from './geoUtils.js';

/**
 * Übersetzt eine aufgezeichnete Spur in eine Folge befahrener Straßen:
 * "A 7 bis Hamburg, dort auf die A 1 …".
 *
 * Die Straßennamen kommen per Reverse-Geocoding von Nominatim (OpenStreetMap).
 * Der Dienst erlaubt eine Anfrage pro Sekunde, deshalb wird die Route grob
 * abgetastet und nur an den Wechselstellen genauer nachgefasst.
 */

/** Nominatim-Richtwert: höchstens eine Anfrage pro Sekunde. */
const REQUEST_INTERVAL_MS = 1100;
/** Abstand der Stützpunkte entlang der Route. */
const SAMPLE_STEP_M = 3000;
/** Abschnitte darunter sind Auffahrten und Kreuze, keine eigene Etappe. */
const MIN_SEGMENT_M = 2500;
/** So oft wird ein Straßenwechsel zwischen zwei Stützpunkten eingegrenzt. */
const REFINE_STEPS = 3;

/** Autobahnen, Bundes- und Nationalstraßen in DE/NL/BE. */
const ROAD_REF = /\b((?:A|B|E|N|L|K)\s?\d{1,3}[a-z]?)\b/i;

/** Zieht die Straßenkennung aus einer Nominatim-Antwort. */
export function roadFromResponse(data) {
  if (!data) return null;
  const address = data.address || {};
  const candidates = [
    data.extratags?.ref,
    address.road,
    data.namedetails?.ref,
    data.name,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const match = String(candidate).match(ROAD_REF);
    // Eine Referenz wie "A 3" ist aussagekräftiger als ein Straßenname
    if (match) return match[1].toUpperCase().replace(/\s+/, ' ').replace(/^([A-Z])(\d)/, '$1 $2');
  }
  return address.road ? String(address.road) : null;
}

/** Ortsbezeichnung für die Formulierung "bei …". */
export function placeFromResponse(data) {
  const a = data?.address || {};
  return a.city || a.town || a.village || a.suburb || a.municipality
    || a.city_district || a.county || a.state || null;
}

/** Stützpunkte entlang der Route, mit Kilometerstand. */
function sampleRoute(points, stepM) {
  if (points.length === 0) return [];
  const samples = [{ point: points[0], km: 0 }];
  let acc = 0;
  let sinceLast = 0;

  for (let i = 1; i < points.length; i++) {
    const d = distanceMeters(points[i - 1], points[i]);
    acc += d;
    sinceLast += d;
    if (sinceLast >= stepM) {
      samples.push({ point: points[i], km: acc / 1000 });
      sinceLast = 0;
    }
  }
  const last = points[points.length - 1];
  if (samples[samples.length - 1].point !== last) samples.push({ point: last, km: acc / 1000 });
  return samples;
}

/** Punkt auf halbem Weg zwischen zwei Kilometerständen der Route. */
function pointAtKm(points, targetKm) {
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const d = distanceMeters(points[i - 1], points[i]);
    if ((acc + d) / 1000 >= targetKm) return points[i];
    acc += d;
  }
  return points[points.length - 1];
}

/** Standard-Abfrage gegen Nominatim. */
async function lookupPlace(point, signal) {
  const url = 'https://nominatim.openstreetmap.org/reverse'
    + `?format=jsonv2&zoom=17&extratags=1&namedetails=1&accept-language=de`
    + `&lat=${point.lat}&lon=${point.lon}`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Geocoding-Dienst antwortete mit ${res.status}`);
  return res.json();
}

/**
 * Wertet die Route aus. `onProgress({done, total})` meldet den Fortschritt,
 * `signal` bricht ab. `lookup` ist austauschbar (Tests, anderer Dienst).
 */
export async function describeRoute(points, {
  onProgress, signal, stepM = SAMPLE_STEP_M, lookup = lookupPlace, intervalMs = REQUEST_INTERVAL_MS,
} = {}) {
  if (!points || points.length < 2) return { segments: [], failed: 0 };

  const samples = sampleRoute(points, stepM);
  const cache = new Map();
  let done = 0;
  let failed = 0;
  let lastRequest = 0;

  async function resolve(point) {
    const key = `${point.lat.toFixed(4)},${point.lon.toFixed(4)}`;
    if (cache.has(key)) return cache.get(key);

    // Dienstlimit einhalten
    const wait = intervalMs - (Date.now() - lastRequest);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    if (signal?.aborted) throw new DOMException('Abgebrochen', 'AbortError');
    lastRequest = Date.now();

    let entry;
    try {
      const data = await lookup(point, signal);
      entry = { road: roadFromResponse(data), place: placeFromResponse(data) };
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      // Einzelne Ausfälle machen die Auswertung nicht wertlos
      failed++;
      entry = { road: null, place: null };
    }
    cache.set(key, entry);
    return entry;
  }

  const marks = [];
  for (const sample of samples) {
    const entry = await resolve(sample.point);
    marks.push({ ...sample, ...entry });
    done++;
    onProgress?.({ done, total: samples.length });
  }

  // Wechselstellen eingrenzen, damit "bei X auf die Y" den richtigen Ort nennt
  for (let i = 1; i < marks.length; i++) {
    if (!marks[i].road || !marks[i - 1].road || marks[i].road === marks[i - 1].road) continue;
    let lowKm = marks[i - 1].km;
    let highKm = marks[i].km;
    let boundary = marks[i];

    for (let step = 0; step < REFINE_STEPS && highKm - lowKm > 0.4; step++) {
      const midKm = (lowKm + highKm) / 2;
      const entry = await resolve(pointAtKm(points, midKm));
      if (entry.road === marks[i - 1].road) {
        lowKm = midKm;
      } else {
        highKm = midKm;
        if (entry.road) boundary = { km: midKm, ...entry };
      }
    }
    marks[i].changeKm = highKm;
    marks[i].changePlace = boundary.place || marks[i].place;
  }

  return { segments: buildSegments(marks), failed };
}

/** Fasst gleiche Straßen zu Etappen zusammen und schluckt kurze Zwischenstücke. */
export function buildSegments(marks) {
  const usable = marks.filter(m => m.road);
  if (usable.length === 0) return [];

  const raw = [];
  for (const mark of usable) {
    const current = raw[raw.length - 1];
    if (current && current.road === mark.road) {
      current.toKm = mark.km;
      if (mark.place) current.places.push(mark.place);
    } else {
      const startKm = mark.changeKm ?? mark.km;
      // Die vorige Etappe endet am Wechsel, nicht an ihrem letzten Stützpunkt —
      // sonst fehlt ihr das Stück bis zur Auffahrt
      if (current) current.toKm = Math.max(current.toKm, startKm);
      raw.push({
        road: mark.road,
        fromKm: startKm,
        toKm: mark.km,
        atPlace: mark.changePlace || mark.place || null,
        places: mark.place ? [mark.place] : [],
      });
    }
  }

  // Auffahrten und Kreuze erzeugen Ein-Punkt-Etappen — die gehören zur Nachbaretappe
  const merged = [];
  for (const segment of raw) {
    const lengthM = (segment.toKm - segment.fromKm) * 1000;
    const previous = merged[merged.length - 1];
    if (lengthM < MIN_SEGMENT_M && previous) {
      previous.toKm = segment.toKm;
      previous.places.push(...segment.places);
      continue;
    }
    if (previous && previous.road === segment.road) {
      previous.toKm = segment.toKm;
      previous.places.push(...segment.places);
      continue;
    }
    merged.push(segment);
  }

  return merged.map(segment => ({
    ...segment,
    lengthKm: Math.max(0, segment.toKm - segment.fromKm),
    places: [...new Set(segment.places)],
  }));
}

/** Die Etappenfolge als Satz — zum Vorlesen oder Kopieren. */
export function segmentsToText(segments) {
  if (!segments || segments.length === 0) return '';
  return segments
    .map((segment, i) => {
      const km = `${segment.lengthKm.toFixed(0)} km`;
      if (i === 0) return `${segment.road} (${km})`;
      return segment.atPlace
        ? `bei ${segment.atPlace} auf die ${segment.road} (${km})`
        : `weiter auf der ${segment.road} (${km})`;
    })
    .join(', ');
}

/** Kurzform für den Vergleich zweier Fahrten: nur die Straßenfolge. */
export function segmentsToChain(segments) {
  return (segments || []).map(s => s.road).join(' → ');
}

/**
 * Stellt zwei ausgewertete Fahrten gegenüber: welche Straßen beide benutzt
 * haben und welche nur eine — die Antwort auf "wo ging es diesmal anders lang".
 */
export function compareRoadLogs(a, b) {
  const roadsA = new Set((a?.segments || []).map(s => s.road));
  const roadsB = new Set((b?.segments || []).map(s => s.road));
  return {
    shared: [...roadsA].filter(r => roadsB.has(r)),
    onlyA: [...roadsA].filter(r => !roadsB.has(r)),
    onlyB: [...roadsB].filter(r => !roadsA.has(r)),
  };
}
