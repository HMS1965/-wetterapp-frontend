import { useState } from 'react';
import ProfileSelector from './components/ProfileSelector.jsx';
import WeatherChat from './components/WeatherChat.jsx';

export default function App() {
  const [profile, setProfile] = useState(null);

  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      <div className="cloud cloud-1" />
      <div className="cloud cloud-2" />
      <div className="cloud cloud-3" />
      {profile
        ? <WeatherChat profile={profile} onBack={() => setProfile(null)} />
        : <ProfileSelector onSelect={setProfile} />
      }
    </div>
  );
}
