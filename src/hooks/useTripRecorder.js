import { useCallback, useEffect, useRef, useState } from 'react';
import { shouldKeepPoint } from '../services/geoUtils.js';
import {
  clearActiveTrip,
  loadActiveTrip,
  newTripId,
  persistActiveTrip,
  saveTrip,
} from '../services/tripStore.js';
import { resolvePlaceName } from '../services/places.js';

const GEO_OPTIONS = { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 };

/**
 * Zeichnet die gefahrene Strecke per GPS auf.
 * Status: 'idle' | 'recording' | 'paused'
 */
export default function useTripRecorder() {
  const [trip, setTrip] = useState(null);
  const [status, setStatus] = useState('idle');
  const [lastFix, setLastFix] = useState(null);
  const [error, setError] = useState(null);
  const [storageWarning, setStorageWarning] = useState(false);

  const watchIdRef = useRef(null);
  const tripRef = useRef(null);
  const statusRef = useRef('idle');
  const wakeLockRef = useRef(null);

  const setTripBoth = useCallback(next => {
    tripRef.current = next;
    setTrip(next);
  }, []);

  const setStatusBoth = useCallback(next => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  // Unterbrochene Aufzeichnung nach Reload wiederherstellen
  useEffect(() => {
    const restored = loadActiveTrip();
    if (!restored) return;
    // Nach einem Reload läuft nichts mehr im Hintergrund — pausiert übernehmen
    const paused = {
      ...restored,
      movingMs: restored.movingMs + (restored.resumedAt ? Date.now() - restored.resumedAt : 0),
      resumedAt: null,
    };
    setTripBoth(paused);
    setStatusBoth('paused');
    persistActiveTrip(paused);
  }, [setTripBoth, setStatusBoth]);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release?.().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator) || wakeLockRef.current) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
      wakeLockRef.current.addEventListener?.('release', () => { wakeLockRef.current = null; });
    } catch {
      // Wake Lock ist ein Komfort-Feature — ohne ihn wird trotzdem aufgezeichnet
    }
  }, []);

  // Der Wake Lock geht verloren, sobald der Tab in den Hintergrund wechselt
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible' && statusRef.current === 'recording') requestWakeLock();
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [requestWakeLock]);

  const handlePosition = useCallback(pos => {
    setError(null);
    const point = {
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? null,
      altitude: pos.coords.altitude ?? null,
      speed: typeof pos.coords.speed === 'number' && !Number.isNaN(pos.coords.speed) ? pos.coords.speed : null,
      heading: typeof pos.coords.heading === 'number' && !Number.isNaN(pos.coords.heading) ? pos.coords.heading : null,
      t: pos.timestamp || Date.now(),
    };
    setLastFix(point);

    if (statusRef.current !== 'recording') return;
    const current = tripRef.current;
    if (!current) return;

    const last = current.points[current.points.length - 1];
    if (!shouldKeepPoint(last, point)) return;

    const next = { ...current, points: [...current.points, point] };
    setTripBoth(next);
    // Jeden Punkt sichern: ein Absturz mitten in der Fahrt darf nichts kosten
    if (!persistActiveTrip(next)) setStorageWarning(true);
  }, [setTripBoth]);

  const handleError = useCallback(err => {
    const messages = {
      1: 'Standortzugriff wurde abgelehnt. Bitte in den Browser-Einstellungen für diese Seite erlauben.',
      2: 'Kein GPS-Signal. Prüfe, ob die Ortung am Gerät aktiv ist.',
      3: 'GPS antwortet nicht — Signal wird noch gesucht.',
    };
    setError(messages[err.code] || err.message || 'Standort konnte nicht ermittelt werden.');
  }, []);

  const startWatching = useCallback(() => {
    if (watchIdRef.current != null) return;
    if (!navigator.geolocation) {
      setError('Dieses Gerät unterstützt keine Standortbestimmung.');
      return;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(handlePosition, handleError, GEO_OPTIONS);
  }, [handlePosition, handleError]);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  useEffect(() => () => { stopWatching(); releaseWakeLock(); }, [stopWatching, releaseWakeLock]);

  const start = useCallback(() => {
    const now = Date.now();
    const fresh = {
      id: newTripId(),
      title: '',
      startedAt: now,
      endedAt: null,
      resumedAt: now,
      movingMs: 0,
      points: [],
    };
    setTripBoth(fresh);
    setStatusBoth('recording');
    setStorageWarning(!persistActiveTrip(fresh));
    startWatching();
    requestWakeLock();
  }, [setTripBoth, setStatusBoth, startWatching, requestWakeLock]);

  const pause = useCallback(() => {
    const current = tripRef.current;
    if (!current || statusRef.current !== 'recording') return;
    const next = {
      ...current,
      movingMs: current.movingMs + (current.resumedAt ? Date.now() - current.resumedAt : 0),
      resumedAt: null,
    };
    setTripBoth(next);
    persistActiveTrip(next);
    setStatusBoth('paused');
    stopWatching();
    releaseWakeLock();
  }, [setTripBoth, setStatusBoth, stopWatching, releaseWakeLock]);

  const resume = useCallback(() => {
    const current = tripRef.current;
    if (!current || statusRef.current !== 'paused') return;
    const next = { ...current, resumedAt: Date.now() };
    setTripBoth(next);
    persistActiveTrip(next);
    setStatusBoth('recording');
    startWatching();
    requestWakeLock();
  }, [setTripBoth, setStatusBoth, startWatching, requestWakeLock]);

  /** Beendet die Fahrt und legt sie im Fahrtenbuch ab. Gibt die gespeicherte Fahrt zurück. */
  const stop = useCallback(async () => {
    const current = tripRef.current;
    stopWatching();
    releaseWakeLock();
    setStatusBoth('idle');
    setTripBoth(null);
    clearActiveTrip();
    if (!current) return null;

    const now = Date.now();
    const finished = {
      ...current,
      endedAt: now,
      movingMs: current.movingMs + (current.resumedAt ? now - current.resumedAt : 0),
      resumedAt: null,
    };
    // Fahrten ohne Bewegung sind nichts wert — nicht ins Fahrtenbuch aufnehmen
    if (finished.points.length < 2) return null;

    saveTrip(finished);

    const from = finished.points[0];
    const to = finished.points[finished.points.length - 1];
    const [fromName, toName] = await Promise.all([resolvePlaceName(from), resolvePlaceName(to)]);
    if (fromName || toName) {
      const withNames = { ...finished, fromName, toName };
      saveTrip(withNames);
      return withNames;
    }
    return finished;
  }, [setTripBoth, setStatusBoth, stopWatching, releaseWakeLock]);

  /** Verwirft die laufende Aufzeichnung ersatzlos. */
  const discard = useCallback(() => {
    stopWatching();
    releaseWakeLock();
    clearActiveTrip();
    setTripBoth(null);
    setStatusBoth('idle');
  }, [setTripBoth, setStatusBoth, stopWatching, releaseWakeLock]);

  return { trip, status, lastFix, error, storageWarning, start, pause, resume, stop, discard };
}
