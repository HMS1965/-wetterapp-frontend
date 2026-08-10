import { useState } from 'react';
import ProfileSelector from './components/ProfileSelector.jsx';
import WeatherChat from './components/WeatherChat.jsx';
import DriveApp from './components/DriveApp.jsx';
import { Car } from 'lucide-react';

export default function App() {
  const [profile, setProfile] = useState(null);
  const [mode, setMode] = useState('weather');

  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      <div className="cloud cloud-1" />
      <div className="cloud cloud-2" />
      <div className="cloud cloud-3" />

      {mode === 'drive' && <DriveApp onBack={() => setMode('weather')} />}

      {mode === 'weather' && (profile
        ? <WeatherChat profile={profile} onBack={() => setProfile(null)} />
        : (
          <>
            <ProfileSelector onSelect={setProfile} />
            <div style={switchWrap}>
              <button style={switchBtn} onClick={() => setMode('drive')}>
                <Car size={18} /> Fahrt aufzeichnen
              </button>
            </div>
          </>
        )
      )}
    </div>
  );
}

const switchWrap = {
  position: 'fixed', zIndex: 2,
  left: 0, right: 0, bottom: '1.5rem',
  display: 'flex', justifyContent: 'center',
  pointerEvents: 'none',
};

const switchBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
  background: 'rgba(255,255,255,0.45)',
  border: '1px solid rgba(255,255,255,0.70)',
  borderRadius: '14px',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  color: '#1a2d42', fontFamily: 'inherit',
  padding: '0.75rem 1.25rem', fontSize: '0.95rem', fontWeight: 600,
  cursor: 'pointer', pointerEvents: 'auto',
  boxShadow: '0 2px 16px rgba(30,80,140,0.10)',
};
