const BASE = (import.meta.env.VITE_API_URL || '') + '/api';

export async function getProfiles() {
  const res = await fetch(`${BASE}/profiles`);
  return res.json();
}

export async function createProfile(name) {
  const res = await fetch(`${BASE}/profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

export async function deleteProfile(id) {
  await fetch(`${BASE}/profiles/${id}`, { method: 'DELETE' });
}

export async function getLocations(profileId) {
  const res = await fetch(`${BASE}/profiles/${profileId}/locations`);
  return res.json();
}

export async function createLocation(profileId, location) {
  const res = await fetch(`${BASE}/profiles/${profileId}/locations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(location)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

export async function deleteLocation(profileId, locId) {
  await fetch(`${BASE}/profiles/${profileId}/locations/${locId}`, { method: 'DELETE' });
}

export async function askWeather(question, profileId, gpsLat, gpsLon) {
  const res = await fetch(`${BASE}/weather/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, profileId, gpsLat, gpsLon })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}
