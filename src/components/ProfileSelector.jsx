import { useState, useEffect } from 'react';
import { getProfiles, createProfile, deleteProfile } from '../services/api.js';

export default function ProfileSelector({ onSelect }) {
  const [profiles, setProfiles] = useState([]);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    const data = await getProfiles();
    setProfiles(data);
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await createProfile(newName.trim());
      setNewName('');
      setError('');
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete(id, e) {
    e.stopPropagation();
    if (!confirm('Profil wirklich löschen?')) return;
    await deleteProfile(id);
    load();
  }

  return (
    <div style={s.container}>
      <div style={s.inner}>
        <img src="/icons/overcast-day.svg" alt="Wetter" style={s.logo} />
        <h1 style={s.title}>WetterApp</h1>
        <p style={s.subtitle}>Wer fragt heute?</p>

        <div style={s.profiles}>
          {profiles.map(p => (
            <div key={p.id} style={s.card} onClick={() => onSelect(p)}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.65)'; e.currentTarget.style.boxShadow = '0 4px 24px rgba(30,80,140,0.18)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.45)'; e.currentTarget.style.boxShadow = '0 2px 16px rgba(30,80,140,0.10)'; }}>
              <span style={s.avatar}>{p.name[0].toUpperCase()}</span>
              <span style={s.cardName}>{p.name}</span>
              <button style={s.deleteBtn} onClick={(e) => handleDelete(p.id, e)}>✕</button>
            </div>
          ))}
        </div>

        <form onSubmit={handleCreate} style={s.form}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Neues Profil anlegen…"
            style={s.input}
            onFocus={e => e.target.style.borderColor = 'rgba(30,100,200,0.4)'}
            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.6)'}
          />
          <button type="submit" style={s.addBtn}>+</button>
        </form>
        {error && <p style={s.error}>{error}</p>}
      </div>
    </div>
  );
}

const glass = {
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
};

const s = {
  container: {
    position: 'relative', zIndex: 1,
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '100vh', padding: '2rem',
  },
  inner: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.75rem',
    background: 'rgba(255,255,255,0.40)',
    border: '1px solid rgba(255,255,255,0.70)',
    borderRadius: '24px',
    padding: '3rem 2.5rem',
    ...glass,
    boxShadow: '0 8px 40px rgba(30,80,140,0.12), inset 0 1px 0 rgba(255,255,255,0.8)',
    maxWidth: '460px', width: '100%',
  },
  logo: { width: '100px', height: '100px', filter: 'drop-shadow(0 4px 16px rgba(80,140,220,0.25))' },
  title: {
    fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.02em',
    color: '#1a2d42',
  },
  subtitle: { color: 'rgba(40,80,130,0.65)', fontSize: '0.95rem', fontWeight: 400, marginTop: '-0.75rem' },
  profiles: { display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center', width: '100%' },
  card: {
    display: 'flex', alignItems: 'center', gap: '0.75rem',
    background: 'rgba(255,255,255,0.45)',
    border: '1px solid rgba(255,255,255,0.70)',
    borderRadius: '14px', padding: '0.9rem 1.1rem',
    cursor: 'pointer', transition: 'background 0.2s, box-shadow 0.2s',
    minWidth: '160px', position: 'relative',
    boxShadow: '0 2px 16px rgba(30,80,140,0.10)',
    ...glass,
  },
  avatar: {
    width: '38px', height: '38px',
    background: 'linear-gradient(135deg, #3b82f6, #60a5fa)',
    borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '1.1rem', fontWeight: 700, flexShrink: 0, color: '#fff',
    boxShadow: '0 2px 10px rgba(59,130,246,0.35)',
  },
  cardName: { fontSize: '1rem', fontWeight: 600, color: '#1a2d42' },
  deleteBtn: { marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(30,60,100,0.35)', cursor: 'pointer', fontSize: '0.8rem', padding: '2px 4px' },
  form: { display: 'flex', gap: '0.5rem', width: '100%' },
  input: {
    flex: 1,
    background: 'rgba(255,255,255,0.50)',
    border: '1px solid rgba(255,255,255,0.60)',
    borderRadius: '10px', color: '#1a2d42',
    padding: '0.75rem 1rem', fontSize: '0.95rem', outline: 'none',
    transition: 'border-color 0.2s',
    ...glass,
  },
  addBtn: {
    background: 'linear-gradient(135deg, #3b82f6, #60a5fa)',
    border: 'none', borderRadius: '10px', color: '#fff',
    padding: '0.75rem 1.25rem', fontSize: '1.3rem',
    cursor: 'pointer', fontWeight: 700,
    boxShadow: '0 2px 12px rgba(59,130,246,0.35)',
  },
  error: { color: '#c0392b', fontSize: '0.88rem' },
};
