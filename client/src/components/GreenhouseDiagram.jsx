import { useId } from 'react';

const TANK_LEVEL = { full: 0.92, pumping: 0.62, idle: 0.46, empty: 0.06 };

// Palette — kept local so the schematic is self-contained.
const C = {
  glass: '#34d399',
  frame: '#d1fae5',
  water: '#38bdf8',
  aqua: '#5eead4',
  leaf: '#a3e635',
  leafDeep: '#4ade80',
  sun: '#fbbf24',
  danger: '#f87171',
  idle: '#64748b',
  ink: '#04110c',
};

const ACTUATORS = [
  { key: 'fans', label: 'Fans' },
  { key: 'vents', label: 'Vents' },
  { key: 'mist', label: 'Mist' },
  { key: 'drip', label: 'Drip' },
  { key: 'light', label: 'Light' },
  { key: 'refill', label: 'Refill' },
];

// A live digital twin of the greenhouse: every actuator animates when it is running.
export default function GreenhouseDiagram({ telemetry, online = true, className = '' }) {
  const uid = useId().replace(/:/g, '');
  const out = (online && telemetry?.out) || {};
  const level = TANK_LEVEL[telemetry?.tank] ?? 0.46;
  const empty = telemetry?.tank === 'empty';
  const waterColor = empty ? C.danger : C.water;

  // Tank geometry
  const tx = 470;
  const tw = 86;
  const tankTop = 128;
  const tankH = 152;
  const waterH = tankH * level;

  const plants = [150, 215, 280, 345];
  const house = 'M70 290 V152 C70 96 140 60 245 60 C350 60 420 96 420 152 V290 Z';
  const id = (n) => `${n}${uid}`;

  return (
    <svg
      viewBox="0 0 600 360"
      className={className}
      role="img"
      aria-label={`Live greenhouse schematic${online ? '' : ' (offline)'}`}
    >
      <defs>
        <linearGradient id={id('glass')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.glass} stopOpacity="0.22" />
          <stop offset="0.6" stopColor={C.glass} stopOpacity="0.06" />
          <stop offset="1" stopColor={C.glass} stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id={id('frame')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={C.aqua} />
          <stop offset="1" stopColor={C.leaf} />
        </linearGradient>
        <linearGradient id={id('beam')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.sun} stopOpacity="0.55" />
          <stop offset="1" stopColor={C.sun} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id('water')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={waterColor} stopOpacity="0.75" />
          <stop offset="1" stopColor={waterColor} stopOpacity="0.25" />
        </linearGradient>
        <linearGradient id={id('soil')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3f2d1f" />
          <stop offset="1" stopColor="#21170f" />
        </linearGradient>
        <radialGradient id={id('halo')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={C.glass} stopOpacity="0.28" />
          <stop offset="1" stopColor={C.glass} stopOpacity="0" />
        </radialGradient>
        <pattern id={id('dots')} width="18" height="18" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill={C.frame} fillOpacity="0.07" />
        </pattern>
        <filter id={id('glow')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <clipPath id={id('house')}><path d={house} /></clipPath>
        <clipPath id={id('tank')}><rect x={tx} y={tankTop} width={tw} height={tankH} rx="14" /></clipPath>
      </defs>

      {/* backdrop */}
      <rect width="600" height="360" fill={`url(#${id('dots')})`} />
      <ellipse cx="245" cy="180" rx="230" ry="150" fill={`url(#${id('halo')})`} />

      {/* remote link — the controller broadcasting to the cloud */}
      <g transform="translate(540 54)">
        {online && [0, 1, 2].map((n) => (
          <circle key={n} r="10" fill="none" stroke={C.glass} strokeWidth="1.5" className="gh-ripple" style={{ animationDelay: `${n * 0.8}s` }} />
        ))}
        <circle r="9" fill={C.ink} stroke={online ? C.glass : C.danger} strokeWidth="1.5" />
        <circle r="3.5" fill={online ? C.glass : C.danger} className={online ? 'gh-pulse' : ''} />
        <text y="30" textAnchor="middle" className="gh-mono" fontSize="9" letterSpacing="1.5" fill={online ? C.glass : C.danger}>
          {online ? 'LIVE' : 'OFFLINE'}
        </text>
      </g>
      <path d="M540 66 V92 Q540 102 530 104 L470 118" fill="none" stroke={C.frame} strokeOpacity="0.15" strokeDasharray="2 4" />

      <g style={{ opacity: online ? 1 : 0.45, filter: online ? 'none' : 'grayscale(1)', transition: 'opacity .6s, filter .6s' }}>
        {/* ground */}
        <rect x="0" y="290" width="600" height="20" fill={C.glass} fillOpacity="0.06" />
        <line x1="20" y1="290" x2="580" y2="290" stroke={C.frame} strokeOpacity="0.18" />

        {/* grow light beam */}
        {out.light && (
          <polygon points="198,122 292,122 350,290 140,290" fill={`url(#${id('beam')})`} className="gh-pulse" clipPath={`url(#${id('house')})`} />
        )}

        {/* house glass + structure */}
        <path d={house} fill={`url(#${id('glass')})`} />
        <g clipPath={`url(#${id('house')})`} stroke={C.frame} strokeOpacity="0.09">
          {[128, 186, 245, 304, 362].map((x) => <line key={x} x1={x} y1="40" x2={x} y2="290" />)}
          {[110, 152, 205].map((y) => <line key={y} x1="60" y1={y} x2="430" y2={y} />)}
          <path d="M92 70 L150 290" strokeOpacity="0.05" strokeWidth="18" />
        </g>
        <path d={house} fill="none" stroke={`url(#${id('frame')})`} strokeWidth="2.5" strokeLinejoin="round" />

        {/* roof vents + exhaust wisps */}
        <g style={{ transformOrigin: '236px 61px', transform: `rotate(${out.vents ? 24 : 0}deg)`, transition: 'transform .9s cubic-bezier(.3,1.4,.5,1)' }}>
          <line x1="236" y1="61" x2="194" y2="66" stroke={out.vents ? C.aqua : C.frame} strokeOpacity={out.vents ? 1 : 0.6} strokeWidth="5" strokeLinecap="round" />
        </g>
        <g style={{ transformOrigin: '254px 61px', transform: `rotate(${out.vents ? -24 : 0}deg)`, transition: 'transform .9s cubic-bezier(.3,1.4,.5,1)' }}>
          <line x1="254" y1="61" x2="296" y2="66" stroke={out.vents ? C.aqua : C.frame} strokeOpacity={out.vents ? 1 : 0.6} strokeWidth="5" strokeLinecap="round" />
        </g>
        {out.vents && [222, 245, 268].map((x, i) => (
          <path key={x} d={`M${x} 52 q -6 -10 0 -20 q 6 -10 0 -20`} fill="none" stroke={C.aqua} strokeOpacity="0.7" strokeWidth="1.6" strokeLinecap="round" className="gh-rise" style={{ animationDelay: `${i * 0.4}s` }} />
        ))}

        {/* fan on the left wall + airflow */}
        <rect x="76" y="192" width="48" height="48" rx="12" fill={C.ink} stroke={out.fans ? C.aqua : C.frame} strokeOpacity={out.fans ? 0.9 : 0.35} strokeWidth="1.5" />
        <g className={out.fans ? 'gh-spin' : ''} style={{ transformOrigin: '100px 216px' }}>
          {[0, 90, 180, 270].map((a) => (
            <path key={a} d="M100 216 C96 206 98 198 104 196 C108 202 106 210 100 216Z" fill={out.fans ? C.aqua : C.idle} transform={`rotate(${a} 100 216)`} />
          ))}
        </g>
        <circle cx="100" cy="216" r="3.5" fill={C.frame} />
        {out.fans && [204, 216, 228].map((y, i) => (
          <path key={y} d={`M132 ${y} q 18 -6 36 0 t 36 0`} fill="none" stroke={C.aqua} strokeOpacity="0.55" strokeWidth="1.5" strokeDasharray="4 7" strokeLinecap="round" className="gh-flow" style={{ animationDelay: `${i * 0.2}s` }} />
        ))}

        {/* grow light fixture */}
        <line x1="210" y1="78" x2="210" y2="114" stroke={C.frame} strokeOpacity="0.3" />
        <line x1="280" y1="78" x2="280" y2="114" stroke={C.frame} strokeOpacity="0.3" />
        <rect x="196" y="112" width="98" height="10" rx="5" fill={out.light ? C.sun : C.idle} fillOpacity={out.light ? 1 : 0.6} filter={out.light ? `url(#${id('glow')})` : undefined} />
        {out.light && [212, 230, 248, 266, 284].map((x) => <circle key={x} cx={x - 4} cy="117" r="1.8" fill="#fff7d6" />)}

        {/* mist line + nozzles */}
        <line x1="140" y1="140" x2="352" y2="140" stroke={C.frame} strokeOpacity="0.25" strokeWidth="3" strokeLinecap="round" />
        {[160, 245, 330].map((x, i) => (
          <g key={x}>
            <rect x={x - 4} y="140" width="8" height="7" rx="2" fill={out.mist ? C.aqua : C.idle} />
            {out.mist && [0, 1, 2].map((n) => (
              <circle key={n} cx={x + (n - 1) * 10} cy="158" r="7" fill={C.aqua} fillOpacity="0.4" className="gh-puff" style={{ animationDelay: `${n * 0.45 + i * 0.25}s`, transformOrigin: `${x + (n - 1) * 10}px 158px` }} />
            ))}
          </g>
        ))}

        {/* raised bed + plants */}
        <rect x="118" y="266" width="258" height="24" rx="6" fill={`url(#${id('soil')})`} stroke={C.frame} strokeOpacity="0.12" />
        {plants.map((x, i) => (
          <g key={x} transform={`translate(${x} 266)`}>
            <g className="gh-sway" style={{ transformOrigin: '0px 0px', animationDelay: `${i * 0.6}s` }}>
              <path d={`M0 0 C0 -22 ${i % 2 ? 5 : -5} -40 0 -58`} fill="none" stroke={C.leafDeep} strokeWidth="3" strokeLinecap="round" />
              <path d="M0 -20 C-16 -22 -26 -34 -26 -34 C-10 -40 0 -32 0 -20Z" fill={C.leafDeep} />
              <path d="M0 -34 C16 -36 26 -48 26 -48 C10 -54 0 -46 0 -34Z" fill={C.leaf} fillOpacity="0.9" />
              <path d="M0 -50 C-9 -54 -13 -64 -13 -64 C-3 -66 1 -60 0 -50Z" fill={C.leaf} />
            </g>
          </g>
        ))}

        {/* supply pipe from tank to drip line */}
        <path d={`M${tx} 262 H436 Q428 262 428 256 V256 H112`} fill="none" stroke={C.water} strokeOpacity="0.22" strokeWidth="5" strokeLinecap="round" />
        {out.drip && (
          <path d={`M${tx} 262 H436 Q428 262 428 256 V256 H112`} fill="none" stroke={C.water} strokeWidth="2.5" strokeDasharray="6 7" strokeLinecap="round" className="gh-flow" />
        )}
        {plants.map((x, i) => (
          <g key={x}>
            <rect x={x - 3} y="252" width="6" height="8" rx="2" fill={out.drip ? C.water : C.idle} />
            {out.drip && <circle cx={x} cy="262" r="2.8" fill={C.water} className="gh-drip" style={{ animationDelay: `${i * 0.3}s` }} />}
          </g>
        ))}

        {/* water tank */}
        <rect x={tx} y={tankTop} width={tw} height={tankH} rx="14" fill={C.ink} />
        <g clipPath={`url(#${id('tank')})`}>
          <g style={{ transform: `translateY(${tankTop + tankH - waterH}px)`, transition: 'transform 1.2s cubic-bezier(.4,0,.2,1)' }}>
            <g className="gh-wave">
              <path d={`M${tx - tw} 0 q 21.5 -6 43 0 t 43 0 t 43 0 t 43 0 t 43 0 V ${tankH} H ${tx - tw} Z`} fill={`url(#${id('water')})`} />
              <path d={`M${tx - tw} 0 q 21.5 -6 43 0 t 43 0 t 43 0 t 43 0 t 43 0`} fill="none" stroke={waterColor} strokeWidth="2" />
            </g>
          </g>
          {out.refill && [0, 1, 2, 3].map((n) => (
            <circle key={n} cx={tx + 18 + n * 16} cy={tankTop + tankH - 6} r="2" fill="#e0f2fe" fillOpacity="0.8" className="gh-bubble" style={{ animationDelay: `${n * 0.5}s` }} />
          ))}
        </g>
        <rect x={tx} y={tankTop} width={tw} height={tankH} rx="14" fill="none" stroke={empty ? C.danger : C.frame} strokeOpacity={empty ? 0.9 : 0.4} strokeWidth="1.5" className={empty ? 'gh-pulse' : ''} />
        <rect x={tx + 8} y={tankTop + 10} width="5" height={tankH - 20} rx="2.5" fill="#fff" fillOpacity="0.06" />
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={tx + tw - 12} x2={tx + tw - 4} y1={tankTop + tankH * (1 - f)} y2={tankTop + tankH * (1 - f)} stroke={C.frame} strokeOpacity="0.35" />
        ))}
        <text x={tx + tw / 2} y={tankTop + 30} textAnchor="middle" className="gh-mono" fontSize="17" fontWeight="600" fill={empty ? C.danger : C.frame}>
          {Math.round(level * 100)}%
        </text>
        <text x={tx + tw / 2} y={tankTop + 44} textAnchor="middle" className="gh-mono" fontSize="8" letterSpacing="1.5" fill={C.frame} fillOpacity="0.5">
          {(telemetry?.tank || 'idle').toUpperCase()}
        </text>

        {/* refill inlet */}
        <path d={`M${tx + tw / 2} ${tankTop - 30} V${tankTop - 8}`} stroke={C.frame} strokeOpacity="0.3" strokeWidth="4" strokeLinecap="round" />
        <rect x={tx + tw / 2 - 16} y={tankTop - 10} width="32" height="7" rx="3.5" fill={out.refill ? C.water : C.idle} />
        {out.refill && [0, 1, 2].map((n) => (
          <circle key={n} cx={tx + tw / 2 + (n - 1) * 8} cy={tankTop - 2} r="2.6" fill={C.water} className="gh-rain" style={{ animationDelay: `${n * 0.3}s` }} />
        ))}
      </g>

      {/* actuator status rail */}
      <g transform="translate(16 320)">
        {ACTUATORS.map(({ key, label }, i) => {
          const on = !!out[key];
          const tone = key === 'light' ? C.sun : key === 'drip' || key === 'refill' ? C.water : C.aqua;
          return (
            <g key={key} transform={`translate(${i * 96} 0)`}>
              <rect width="88" height="28" rx="14" fill={on ? tone : C.frame} fillOpacity={on ? 0.12 : 0.04} stroke={on ? tone : C.frame} strokeOpacity={on ? 0.55 : 0.12} />
              <circle cx="16" cy="14" r="4" fill={on ? tone : C.idle} className={on ? 'gh-pulse' : ''} />
              <text x="27" y="17.5" className="gh-mono" fontSize="9" letterSpacing="0.4" fill={C.frame} fillOpacity={on ? 0.95 : 0.45}>
                {label.toUpperCase()}
              </text>
              <text x="80" y="17.5" textAnchor="end" className="gh-mono" fontSize="7.5" fill={on ? tone : C.frame} fillOpacity={on ? 1 : 0.3}>
                {on ? 'ON' : 'OFF'}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
