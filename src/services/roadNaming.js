import { bearing, distanceMeters } from './geoUtils.js';

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
/**
 * Der Abstand der Stützpunkte richtet sich nach dem Tempo, denn danach
 * richtet sich auch, wie dicht die Straßen wechseln: auf der Autobahn alle
 * paar Kilometer, im Ort alle paar hundert Meter. Mit festem Abstand fielen
 * die kleinen Straßen am Anfang und Ende der Fahrt unter den Tisch.
 */
function stepForSpeed(speed) {
  if (speed == null) return FALLBACK_STEP_M;
  if (speed >= 25) return 3500;   // ab 90 km/h — Autobahn
  if (speed >= 15) return 1200;   // 55–90 km/h — Land- und Schnellstraße
  if (speed >= 8) return 500;     // 30–55 km/h — Ortsdurchfahrt
  return 250;                     // Schritttempo, Wohngebiet, Stau
}
/** Ohne verwertbare Zeitstempel bleibt nur ein fester Abstand. */
const FALLBACK_STEP_M = 800;
/** Darunter ist es Messrauschen an einer Kreuzung, keine eigene Etappe. */
const NOISE_SEGMENT_M = 120;
/** So kurz darf ein Zwischenstück zwischen zwei Teilen derselben Straße sein. */
const RAMP_SEGMENT_M = 2500;
/** So oft wird ein Straßenwechsel zwischen zwei Stützpunkten eingegrenzt. */
const REFINE_STEPS = 3;

/** Autobahnen, Bundes- und Nationalstraßen in DE/NL/BE. */
const ROAD_REF = /\b((?:A|B|E|N|L|K)\s?\d{1,3}[a-z]?)\b/i;
/** Namen von Auf- und Abfahrten in DE/NL/BE. */
const RAMP_NAME = /^\s*(ausfahrt|auffahrt|abfahrt|anschlussstelle|afrit|oprit|verbindingsweg|rampe|zufahrt|bretelle)\b/i;

/**
 * Auf- und Abfahrten sind keine eigene Etappe: Wer von der A 7 auf die A 8
 * wechselt, ist kurz auf einer Rampe — das gehört nicht in die Wegbeschreibung.
 * OSM kennzeichnet sie als "…_link", sonst hilft der Name weiter.
 */
export function isRampResponse(data, road) {
  if (typeof data?.type === 'string' && data.type.endsWith('_link')) return true;
  return RAMP_NAME.test(String(road || ''));
}

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

/** Strasse mit Hausnummer, für Start und Ziel der Fahrt. */
export function addressFromResponse(data) {
  const a = data?.address || {};
  const street = a.road || a.pedestrian || a.residential || a.footway || null;
  if (!street) return null;
  return a.house_number ? `${street} ${a.house_number}` : street;
}

/** Ortsbezeichnung für die Formulierung "bei …". */
export function placeFromResponse(data) {
  const a = data?.address || {};
  return a.city || a.town || a.village || a.suburb || a.municipality
    || a.city_district || a.county || a.state || null;
}

/** Tempo zwischen zwei Punkten in m/s, oder null wenn nicht bestimmbar. */
function localSpeed(a, b) {
  if (typeof b.speed === 'number' && b.speed >= 0) return b.speed;
  const dt = (b.t - a.t) / 1000;
  if (!Number.isFinite(dt) || dt <= 0) return null;
  return distanceMeters(a, b) / dt;
}

/**
 * Stützpunkte entlang der Route, mit Kilometerstand. Der Abstand richtet sich
 * nach dem Tempo an der jeweiligen Stelle, damit langsame Abschnitte fein
 * genug abgetastet werden.
 */
function sampleRoute(points) {
  if (points.length === 0) return [];
  const samples = [{ point: points[0], km: 0 }];
  let acc = 0;
  let sinceLast = 0;

  for (let i = 1; i < points.length; i++) {
    const d = distanceMeters(points[i - 1], points[i]);
    acc += d;
    sinceLast += d;

    if (sinceLast >= stepForSpeed(localSpeed(points[i - 1], points[i]))) {
      samples.push({ point: points[i], km: acc / 1000 });
      sinceLast = 0;
    }
  }
  const last = points[points.length - 1];
  if (samples[samples.length - 1].point !== last) samples.push({ point: last, km: acc / 1000 });
  return samples;
}

/**
 * Schätzt vorab, wie viele Abfragen die Auswertung braucht und wie lange
 * sie dauert. Die Wechselstellen kommen erfahrungsgemäß mit etwa einem
 * Drittel obendrauf.
 */
export function estimateRoadLookup(points, { intervalMs = REQUEST_INTERVAL_MS } = {}) {
  if (!points || points.length < 2) return { requests: 0, seconds: 0 };
  const requests = Math.round((sampleRoute(points).length + 2) * 1.35);
  return { requests, seconds: Math.round((requests * intervalMs) / 1000) };
}

/**
 * In welche Richtung ging es an der Wechselstelle? Rein geometrisch aus dem
 * Kurs vor und nach dem Wechsel — kostet keine zusätzliche Abfrage.
 */
export function turnAt(points, km, { spanKm = 0.25, searchKm = 0.4, stepKm = 0.1 } = {}) {
  // Die Wechselstelle ist nur auf ein paar hundert Meter genau bekannt,
  // deshalb im Umkreis die deutlichste Richtungsänderung suchen.
  let strongest = null;
  for (let offset = -searchKm; offset <= searchKm + 1e-9; offset += stepKm) {
    const delta = bearingChangeAt(points, Math.max(0, km + offset), spanKm);
    if (delta != null && (strongest == null || Math.abs(delta) > Math.abs(strongest))) {
      strongest = delta;
    }
  }
  if (strongest == null) return null;

  if (Math.abs(strongest) < 25) return 'straight';
  if (Math.abs(strongest) > 150) return 'around';
  return strongest < 0 ? 'left' : 'right';
}

/** Kursänderung an einer Stelle: negativ nach links, positiv nach rechts. */
function bearingChangeAt(points, km, spanKm) {
  const before = pointAtKm(points, Math.max(0, km - spanKm));
  const at = pointAtKm(points, km);
  const after = pointAtKm(points, km + spanKm);
  if (before === at || at === after) return null;
  return ((bearing(at, after) - bearing(before, at) + 540) % 360) - 180;
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
async function lookupPlace(point, signal, zoom = 17) {
  const url = 'https://nominatim.openstreetmap.org/reverse'
    + `?format=jsonv2&zoom=${zoom}&extratags=1&namedetails=1&accept-language=de`
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
  onProgress, signal, lookup = lookupPlace, intervalMs = REQUEST_INTERVAL_MS,
} = {}) {
  if (!points || points.length < 2) return { segments: [], start: null, end: null, failed: 0 };

  const samples = sampleRoute(points);
  const cache = new Map();
  let done = 0;
  let failed = 0;
  let lastRequest = 0;

  async function resolve(point, zoom = 17) {
    const key = `${zoom}:${point.lat.toFixed(4)},${point.lon.toFixed(4)}`;
    if (cache.has(key)) return cache.get(key);

    // Dienstlimit einhalten
    const wait = intervalMs - (Date.now() - lastRequest);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    if (signal?.aborted) throw new DOMException('Abgebrochen', 'AbortError');
    lastRequest = Date.now();

    let entry;
    try {
      const data = await lookup(point, signal, zoom);
      const road = roadFromResponse(data);
      entry = {
        road,
        place: placeFromResponse(data),
        address: addressFromResponse(data),
        ramp: isRampResponse(data, road),
      };
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      // Einzelne Ausfälle machen die Auswertung nicht wertlos
      failed++;
      entry = { road: null, place: null, address: null, ramp: false };
    }
    cache.set(key, entry);
    return entry;
  }

  const total = samples.length + 2;
  // Start und Ziel genauer abfragen — dort interessiert die Hausnummer
  const start = await resolve(points[0], 18);
  onProgress?.({ done: ++done, total });
  const end = await resolve(points[points.length - 1], 18);
  onProgress?.({ done: ++done, total });

  const collected = [];
  for (const sample of samples) {
    const entry = await resolve(sample.point);
    collected.push({ ...sample, ...entry });
    onProgress?.({ done: ++done, total });
  }
  // Rampen fliegen raus, bevor die Etappen gebildet werden
  const marks = collected.filter(m => !m.ramp);

  // Wechselstellen eingrenzen, damit "bei X auf die Y" den richtigen Ort nennt
  for (let i = 1; i < marks.length; i++) {
    if (!marks[i].road || !marks[i - 1].road || marks[i].road === marks[i - 1].road) continue;
    let lowKm = marks[i - 1].km;
    let highKm = marks[i].km;
    let boundary = marks[i];

    for (let step = 0; step < REFINE_STEPS && highKm - lowKm > 0.4; step++) {
      const midKm = (lowKm + highKm) / 2;
      const entry = await resolve(pointAtKm(points, midKm));
      if (entry.ramp) {
        // Auf der Rampe hat man die alte Straße schon verlassen
        highKm = midKm;
      } else if (entry.road === marks[i - 1].road) {
        lowKm = midKm;
      } else {
        highKm = midKm;
        if (entry.road) boundary = { km: midKm, ...entry };
      }
    }
    marks[i].changeKm = highKm;
    marks[i].changePlace = boundary.place || marks[i].place;
    marks[i].turn = turnAt(points, highKm);
  }

  return {
    segments: buildSegments(marks),
    start: { address: start.address, place: start.place },
    end: { address: end.address, place: end.place },
    failed,
  };
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
        turn: mark.turn || null,
        places: mark.place ? [mark.place] : [],
      });
    }
  }

  const merged = [];
  for (let i = 0; i < raw.length; i++) {
    const segment = raw[i];
    const lengthM = (segment.toKm - segment.fromKm) * 1000;
    const previous = merged[merged.length - 1];
    const next = raw[i + 1];

    // An Kreuzungen schnappt das Reverse-Geocoding auf die Querstraße
    const isNoise = lengthM < NOISE_SEGMENT_M;
    // Auffahrt oder Kreuz: ein kurzes Stück zwischen zwei Teilen derselben Straße.
    // Ortsstraßen zwischen zwei verschiedenen Straßen bleiben dagegen stehen.
    const isRamp = lengthM < RAMP_SEGMENT_M && previous && next && previous.road === next.road;

    if (previous && (isNoise || isRamp)) {
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

/** Ist das eine nummerierte Straße (A 7, N 240) oder ein Straßenname? */
export function isRoadRef(road) {
  return ROAD_REF.test(String(road || '')) && /\d/.test(String(road || ''));
}

/** Kurze Etappen in Metern, lange in Kilometern. */
export function formatLeg(km) {
  return km < 1
    ? `${Math.round(km * 1000)} m`
    : `${km.toLocaleString('de-DE', { maximumFractionDigits: km < 10 ? 1 : 0 })} km`;
}

/** Die Etappenfolge als Satz — zum Vorlesen oder Kopieren. */
export function segmentsToText(segments, { start = null, end = null } = {}) {
  if (!segments || segments.length === 0) return '';
  const middle = segments
    .map((segment, i) => {
      const len = `(${formatLeg(segment.lengthKm)})`;
      // "auf die A 7" passt, "auf die Am Buchenbaum" nicht — Namen brauchen "über"
      const onto = isRoadRef(segment.road) ? `auf die ${segment.road}` : `über ${segment.road}`;
      if (i === 0) return `${segment.road} ${len}`;
      return segment.atPlace
        ? `bei ${segment.atPlace} ${onto} ${len}`
        : `weiter ${onto} ${len}`;
    })
    .join(', ');

  const from = start?.address ? `Ab ${[start.address, start.place].filter(Boolean).join(', ')}: ` : '';
  const to = end?.address ? `, Ziel ${[end.address, end.place].filter(Boolean).join(', ')}` : '';
  return `${from}${middle}${to}`;
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
