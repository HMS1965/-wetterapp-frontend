export default function WeatherIcon({ size = 88 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 88 88" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="cloudShadow" x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="rgba(80,120,180,0.18)" />
        </filter>
      </defs>

      {/* Sonnenstrahlen */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const cx = 34, cy = 34, r1 = 17, r2 = 23;
        return (
          <line
            key={i}
            x1={cx + Math.cos(rad) * r1} y1={cy + Math.sin(rad) * r1}
            x2={cx + Math.cos(rad) * r2} y2={cy + Math.sin(rad) * r2}
            stroke="#FBBF24" strokeWidth="3.5" strokeLinecap="round"
          />
        );
      })}

      {/* Sonne */}
      <circle cx="34" cy="34" r="13" fill="#FCD34D" />

      {/* Wolke — drei überlagerte Kreise + Bodenrechteck */}
      <g filter="url(#cloudShadow)">
        <ellipse cx="38" cy="68" rx="22" ry="14" fill="white" />
        <ellipse cx="58" cy="64" rx="16" ry="13" fill="white" />
        <ellipse cx="48" cy="55" rx="14" ry="13" fill="white" />
        <ellipse cx="34" cy="60" rx="15" ry="12" fill="white" />
        {/* Boden glätten */}
        <rect x="16" y="66" width="58" height="12" rx="10" fill="white" />
      </g>
    </svg>
  );
}
