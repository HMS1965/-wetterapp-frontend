import { useState, useEffect } from 'react';
import { getLocations, createLocation, deleteLocation } from '../services/api.js';

export default function LocationManager({ profile, onClose }) {
  const [locations, setLocations] = useState([]);
  const [label, setLabel] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    const data = await getLocations(profile.id);
    setLocations(data);
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!label.trim() || !city.trim()) return;
    try {
      await createLocation(profile.id, { label: label.trim(), city: city.trim(), address: address.trim() || null });
      setLabel(''); setCity(''); setAddress(''); setError('');
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete(locId) {
    await deleteLocation(profile.id, locId);
    load();
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>Orte für {profile.name}</h2>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        <div style={styles.list}>
          {locations.length === 0 && <p style={styles.empty}>Noch keine Orte gespeichert.</p>}
          {locations.map(l => (
            <div key={l.id} style={styles.locItem}>
              <div>
                <span style={styles.locLabel}>„{l.label}"</span>
                <span style={styles.locCity}>{l.city}{l.address ? ` · ${l.address}` : ''}</span>
              </div>
              <button onClick={() => handleDelete(l.id)} style={styles.delBtn}>🗑</button>
            </div>
          ))}
        </div>

        <form onSubmit={handleAdd} style={styles.form}>
          <p style={styles.formLabel}>Neuen Ort hinzufügen:</p>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder='Bezeichnung (z.B. "zuhause", "arbeit")' style={styles.input} />
          <input value={city} onChange={e => setCity(e.target.value)} placeholder="Stadt (z.B. Duisburg)" style={styles.input} />
          <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Adresse optional (z.B. Klästraße 14)" style={styles.input} />
          {error && <p style={styles.error}>{error}</p>}
          <button type="submit" style={styles.addBtn}>Ort speichern</button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' },
  modal: { background: '#1e1e30', borderRadius: '16px', width: '100%', maxWidth: '480px', maxHeight: '80vh', overflow: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: '#fff', fontSize: '1.1rem', fontWeight: 700 },
  closeBtn: { background: 'none', border: 'none', color: '#aaa', fontSize: '1.2rem', cursor: 'pointer' },
  list: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  empty: { color: '#666', fontSize: '0.9rem' },
  locItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#2a2a40', borderRadius: '8px', padding: '0.75rem 1rem' },
  locLabel: { color: '#4f8ef7', fontWeight: 600, marginRight: '0.5rem' },
  locCity: { color: '#aaa', fontSize: '0.9rem' },
  delBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' },
  form: { display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid #333', paddingTop: '1rem' },
  formLabel: { color: '#aaa', fontSize: '0.85rem' },
  input: { background: '#2a2a40', border: '1px solid #444', borderRadius: '8px', color: '#fff', padding: '0.65rem 0.9rem', fontSize: '0.95rem', outline: 'none' },
  error: { color: '#f74f4f', fontSize: '0.85rem' },
  addBtn: { background: '#4f8ef7', border: 'none', borderRadius: '8px', color: '#fff', padding: '0.75rem', fontSize: '0.95rem', cursor: 'pointer', fontWeight: 600 }
};
