/** Gemeinsame Glas-Optik für den Fahrten-Modus (gleiche Sprache wie die Wetter-Ansicht). */
export const glass = {
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
};

export const panel = {
  background: 'rgba(255,255,255,0.40)',
  border: '1px solid rgba(255,255,255,0.70)',
  borderRadius: '24px',
  boxShadow: '0 8px 40px rgba(30,80,140,0.12), inset 0 1px 0 rgba(255,255,255,0.8)',
  ...glass,
};

export const softCard = {
  background: 'rgba(255,255,255,0.45)',
  border: '1px solid rgba(255,255,255,0.70)',
  borderRadius: '16px',
  boxShadow: '0 2px 16px rgba(30,80,140,0.10)',
  ...glass,
};

export const primaryButton = {
  background: 'linear-gradient(135deg, #3b82f6, #60a5fa)',
  border: 'none',
  borderRadius: '14px',
  color: '#fff',
  padding: '0.9rem 1.4rem',
  fontSize: '1rem',
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: '0 2px 12px rgba(59,130,246,0.35)',
  fontFamily: 'inherit',
};

export const ghostButton = {
  background: 'rgba(255,255,255,0.50)',
  border: '1px solid rgba(255,255,255,0.70)',
  borderRadius: '14px',
  color: '#1a2d42',
  padding: '0.9rem 1.4rem',
  fontSize: '1rem',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  ...glass,
};

export const dangerButton = {
  ...ghostButton,
  color: '#b91c1c',
};

export const label = {
  fontSize: '0.72rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'rgba(30,70,120,0.6)',
  fontWeight: 600,
};

export const value = {
  fontSize: '1.35rem',
  fontWeight: 700,
  color: '#1a2d42',
  letterSpacing: '-0.02em',
};
