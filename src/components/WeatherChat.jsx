import { useState, useRef, useEffect } from 'react';
import { askWeather } from '../services/api.js';
import LocationManager from './LocationManager.jsx';
import { Mic, MicOff, Send, Pause, Play, RotateCcw, MapPin, ChevronLeft, Navigation } from 'lucide-react';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export default function WeatherChat({ profile, onBack }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: `Hallo ${profile.name}! Stell mir deine Wetterfrage — per Sprache oder Text.` }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [gps, setGps] = useState(null);
  const [showLocations, setShowLocations] = useState(false);
  const [lastAnswer, setLastAnswer] = useState(null);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const recognitionRef = useRef(null);
  const messagesEndRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const audioCtxRef = useRef(null);
  const sourceRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => setGps({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => setGps(null),
      { timeout: 5000 }
    );
  }, []);

  function prepareForSpeech(text) {
    return text
      .replace(/km\/h/gi, 'Kilometer pro Stunde')
      .replace(/°C/g, 'Grad Celsius')
      .replace(/°F/g, 'Grad Fahrenheit')
      .replace(/(\d+)\s*%/g, '$1 Prozent')
      .replace(/(\d+(?:,\d+)?)\s*mm/g, '$1 Millimeter')
      .replace(/ca\./gi, 'circa')
      .replace(/bzw\./gi, 'beziehungsweise')
      .replace(/z\.B\./gi, 'zum Beispiel')
      .replace(/u\.a\./gi, 'unter anderem');
  }

  async function speak(text) {
    synthRef.current.cancel();
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') await ctx.resume();

      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: prepareForSpeech(text) })
      });
      if (!res.ok) throw new Error('TTS fehlgeschlagen');
      const arrayBuffer = await res.arrayBuffer();

      const pcm = new Int16Array(arrayBuffer, 44);

      // Aufweck-Rampe: hält Bluetooth-Kopfhörer wach, verhindert Satzanfang-Cutoff
      const leadInSamples = Math.floor(24000 * 0.8);
      const audioBuffer = ctx.createBuffer(1, leadInSamples + pcm.length, 24000);
      const channel = audioBuffer.getChannelData(0);
      for (let i = 0; i < leadInSamples; i++) {
        channel[i] = Math.sin(2 * Math.PI * 80 * i / 24000) * 0.006;
      }
      for (let i = 0; i < pcm.length; i++) {
        channel[leadInSamples + i] = pcm[i] / 32768;
      }
      if (sourceRef.current) { try { sourceRef.current.stop(); } catch { /* schon beendet */ } }
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => { if (sourceRef.current === source) setSpeaking(false); };
      sourceRef.current = source;
      setPaused(false);
      setSpeaking(true);
      source.start();
    } catch {
      const utt = new SpeechSynthesisUtterance(prepareForSpeech(text));
      utt.lang = 'de-DE';
      utt.rate = 1.05;
      synthRef.current.speak(utt);
    }
  }

  async function togglePause() {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    if (ctx.state === 'running') {
      await ctx.suspend();
      setPaused(true);
    } else if (ctx.state === 'suspended') {
      await ctx.resume();
      setPaused(false);
    }
  }

  function startListening() {
    if (!SpeechRecognition) {
      alert('Spracherkennung wird von diesem Browser nicht unterstützt. Bitte Chrome verwenden.');
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = 'de-DE';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setInput(transcript);
      handleAsk(transcript);
    };
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  async function handleAsk(question) {
    const q = question || input.trim();
    if (!q || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: q }]);
    setLoading(true);
    try {
      const { answer, iconName } = await askWeather(q, profile.id, gps?.lat, gps?.lon);
      setMessages(prev => [...prev, { role: 'assistant', text: answer, iconName }]);
      setLastAnswer(answer);
      speak(answer);
    } catch (e) {
      const errMsg = `Fehler: ${e.message}`;
      setMessages(prev => [...prev, { role: 'assistant', text: errMsg, error: true }]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    handleAsk(input);
  }

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <button onClick={onBack} style={s.backBtn}><ChevronLeft size={18} style={{verticalAlign:'middle',marginRight:'2px'}}/>Profile</button>
        <div style={s.headerCenter}>
          <span style={s.avatar}>{profile.name[0].toUpperCase()}</span>
          <span style={s.profileName}>{profile.name}</span>
          {gps && <span style={s.gpsBadge}><Navigation size={11} style={{verticalAlign:'middle',marginRight:'3px'}}/>GPS</span>}
        </div>
        <div style={{ width: '80px' }} />
      </div>

      {/* Messages */}
      <div style={s.messages}>
        {messages.map((m, i) => (
          <div key={i} style={m.role === 'user' ? s.userWrapper : s.aiWrapper}>
            {m.role === 'assistant' && m.iconName && (
              <img
                src={`/icons/${m.iconName}.svg`}
                alt={m.iconName}
                style={s.weatherIcon}
              />
            )}
            <div style={{
              ...s.bubble,
              ...(m.role === 'user' ? s.userBubble : s.aiBubble),
              ...(m.error ? s.errorBubble : {})
            }}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ ...s.bubble, ...s.aiBubble, ...s.loadingBubble }}>
            <span style={s.dot} />
            <span style={{ ...s.dot, animationDelay: '0.2s' }} />
            <span style={{ ...s.dot, animationDelay: '0.4s' }} />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input row */}
      <form onSubmit={handleSubmit} style={s.inputRow}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Deine Wetterfrage…"
          style={s.textInput}
          disabled={loading || listening}
          onFocus={e => e.target.style.borderColor = 'rgba(106,171,255,0.5)'}
          onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.12)'}
        />
        <button
          type="button"
          onMouseDown={startListening}
          onMouseUp={stopListening}
          onTouchStart={startListening}
          onTouchEnd={stopListening}
          style={{ ...s.iconBtn, ...(listening ? s.micActive : {}) }}
          title="Halten zum Sprechen"
        >{listening ? <MicOff size={20} color="#dc2626"/> : <Mic size={20} color="#3b82f6"/>}</button>
        <button type="submit" style={s.sendBtn} disabled={loading || !input.trim()}><Send size={18} color="#fff"/></button>
        {speaking && (
          <button type="button" onClick={togglePause} style={s.iconBtn} title={paused ? 'Weiter' : 'Pause'}>
            {paused ? <Play size={20} color="#3b82f6"/> : <Pause size={20} color="#3b82f6"/>}
          </button>
        )}
        {lastAnswer && (
          <button type="button" onClick={() => speak(lastAnswer)} style={s.iconBtn} title="Wiederholen"><RotateCcw size={20} color="#3b82f6"/></button>
        )}
        <button type="button" onClick={() => setShowLocations(true)} style={s.iconBtn} title="Orte verwalten"><MapPin size={20} color="#3b82f6"/></button>
      </form>

      {showLocations && <LocationManager profile={profile} onClose={() => setShowLocations(false)} />}
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
    display: 'flex', flexDirection: 'column', height: '100vh',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '1rem 1.25rem',
    background: 'rgba(255,255,255,0.45)',
    borderBottom: '1px solid rgba(255,255,255,0.65)',
    boxShadow: '0 1px 12px rgba(30,80,140,0.08)',
    ...glass,
  },
  backBtn: {
    background: 'none', border: 'none',
    color: '#2563eb', cursor: 'pointer',
    fontSize: '0.88rem', fontWeight: 500,
    width: '80px', textAlign: 'left',
  },
  headerCenter: { display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, justifyContent: 'center' },
  avatar: {
    width: '32px', height: '32px',
    background: 'linear-gradient(135deg, #3b82f6, #60a5fa)',
    borderRadius: '50%', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: '0.95rem', fontWeight: 700, color: '#fff',
    boxShadow: '0 2px 10px rgba(59,130,246,0.3)',
  },
  profileName: { color: '#1a2d42', fontWeight: 600, fontSize: '0.95rem' },
  gpsBadge: {
    fontSize: '0.72rem', color: '#15803d',
    background: 'rgba(22,163,74,0.12)',
    border: '1px solid rgba(22,163,74,0.25)',
    padding: '2px 8px', borderRadius: '20px',
  },
  messages: {
    flex: 1, overflowY: 'auto', padding: '1.5rem 1.25rem',
    display: 'flex', flexDirection: 'column', gap: '0.85rem',
  },
  aiWrapper: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.35rem', maxWidth: '78%' },
  userWrapper: { display: 'flex', justifyContent: 'flex-end', width: '100%' },
  weatherIcon: { width: '52px', height: '52px', marginLeft: '0.25rem', filter: 'drop-shadow(0 2px 6px rgba(30,80,140,0.15))' },
  bubble: {
    maxWidth: '100%', padding: '0.9rem 1.15rem',
    borderRadius: '18px', lineHeight: 1.6,
    fontSize: '0.97rem', whiteSpace: 'pre-wrap',
    ...glass,
  },
  userBubble: {
    alignSelf: 'flex-end',
    background: 'rgba(59,130,246,0.18)',
    border: '1px solid rgba(59,130,246,0.30)',
    color: '#1a2d42',
    borderBottomRightRadius: '4px',
    boxShadow: '0 2px 12px rgba(59,130,246,0.10)',
  },
  aiBubble: {
    alignSelf: 'flex-start',
    background: 'rgba(255,255,255,0.55)',
    border: '1px solid rgba(255,255,255,0.75)',
    color: '#1a2d42',
    borderBottomLeftRadius: '4px',
    boxShadow: '0 2px 16px rgba(30,80,140,0.08)',
  },
  errorBubble: {
    background: 'rgba(220,50,50,0.10)',
    border: '1px solid rgba(220,50,50,0.25)',
    color: '#c0392b',
  },
  loadingBubble: { display: 'flex', gap: '6px', alignItems: 'center', padding: '1rem 1.25rem' },
  dot: {
    width: '7px', height: '7px',
    background: 'rgba(59,130,246,0.7)',
    borderRadius: '50%',
    animation: 'pulse 1.2s ease-in-out infinite',
    display: 'inline-block',
  },
  inputRow: {
    display: 'flex', gap: '0.5rem', padding: '0.9rem 1.25rem',
    background: 'rgba(255,255,255,0.45)',
    borderTop: '1px solid rgba(255,255,255,0.65)',
    alignItems: 'center',
    boxShadow: '0 -1px 12px rgba(30,80,140,0.06)',
    ...glass,
  },
  textInput: {
    flex: 1,
    background: 'rgba(255,255,255,0.55)',
    border: '1px solid rgba(255,255,255,0.70)',
    borderRadius: '24px', color: '#1a2d42',
    padding: '0.72rem 1.25rem', fontSize: '0.97rem', outline: 'none',
    transition: 'border-color 0.2s',
    ...glass,
  },
  iconBtn: {
    width: '44px', height: '44px', background: 'none', border: 'none',
    fontSize: '1.3rem', cursor: 'pointer', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: '50%', transition: 'background 0.15s',
  },
  micActive: { background: 'rgba(220,50,50,0.15)' },
  sendBtn: {
    width: '44px', height: '44px', flexShrink: 0,
    background: 'linear-gradient(135deg, #3b82f6, #60a5fa)',
    border: 'none', borderRadius: '50%', color: '#fff',
    cursor: 'pointer',
    boxShadow: '0 2px 12px rgba(59,130,246,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
};
