'use client';

import { useId, useState } from 'react';

/**
 * Before/after comparison for photo restoration. The "photo" is drawn in SVG;
 * the slider reveals the restored version over the damaged one.
 */
export function Restoration() {
  const [split, setSplit] = useState(52);
  const id = useId();

  return (
    <div className="flex flex-col gap-4">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-card border-[10px] border-[#fbf7f0] shadow-[0_1px_0_#d8ccb8,0_20px_40px_-24px_rgba(24,33,63,0.45)]">
        <Portrait damaged />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
          <Portrait />
        </div>
        <div aria-hidden className="absolute inset-y-0 w-0.5 bg-[#fbf7f0]" style={{ left: `${split}%` }} />
        <span className="absolute bottom-3 left-3 rounded-sm bg-black/55 px-2 py-0.5 text-sm text-white">До</span>
        <span className="absolute right-3 bottom-3 rounded-sm bg-black/55 px-2 py-0.5 text-sm text-white">После</span>
      </div>
      <label htmlFor={id} className="sr-only">
        Сравнить фото до и после реставрации
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        value={split}
        onChange={(e) => setSplit(Number(e.target.value))}
        className="w-full accent-shezhire-indigo"
      />
    </div>
  );
}

function Portrait({ damaged = false }: { damaged?: boolean }) {
  const uid = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 400 500" className="absolute inset-0 size-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <radialGradient id={`bg${uid}`} cx="50%" cy="38%" r="70%">
          <stop offset="0" stopColor={damaged ? '#cdb48c' : '#d9d4cb'} />
          <stop offset="1" stopColor={damaged ? '#7d6340' : '#57534d'} />
        </radialGradient>
        <filter id={`grain${uid}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" />
          <feColorMatrix values="0 0 0 0 0.3  0 0 0 0 0.22  0 0 0 0 0.12  0 0 0 0.55 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <filter id={`soft${uid}`}>
          <feGaussianBlur stdDeviation={damaged ? 2.2 : 0} />
        </filter>
      </defs>
      <rect width="400" height="500" fill={`url(#bg${uid})`} />
      <g filter={`url(#soft${uid})`}>
        {/* a couple, 1950s studio portrait: dark clothes, light faces, dark hair */}
        <g fill={damaged ? '#3b2c1b' : '#1d1b19'}>
          <path d="M66 500c4-118 36-196 84-212s80 96 84 212Z" />
          <path d="M178 500c6-126 38-206 80-224s80 108 86 224Z" />
        </g>
        <g fill={damaged ? '#dcc59c' : '#ddd6cb'}>
          <ellipse cx="150" cy="200" rx="34" ry="44" />
          <ellipse cx="258" cy="190" rx="33" ry="43" />
          <path d="M138 240h24v34h-24ZM246 230h24v34h-24Z" />
        </g>
        <g fill={damaged ? '#2e2214' : '#141210'}>
          <path d="M114 196c-2-38 16-62 36-62s40 22 36 62c-6-20-18-30-36-30s-30 10-36 30Z" />
          <path d="M222 188c-4-40 14-66 36-66s40 26 36 66c-8-16-20-26-36-26s-28 10-36 26Z" />
        </g>
        <g fill="none" stroke={damaged ? '#6b5233' : '#3a3632'} strokeWidth="2.2" strokeLinecap="round">
          <path d="M136 200h8M156 200h8M244 190h8M264 190h8M144 222q6 4 12 0M252 212q6 4 12 0" />
        </g>
      </g>
      {damaged && (
        <g>
          <rect width="400" height="500" filter={`url(#grain${uid})`} />
          <path d="M40 0C90 140 60 260 130 500" stroke="#f4ead6" strokeWidth="2.5" fill="none" opacity="0.8" />
          <path d="M300 60c-20 60 30 120 10 200" stroke="#f4ead6" strokeWidth="1.5" fill="none" opacity="0.7" />
          <path d="M0 330h400" stroke="#f4ead6" strokeWidth="3" opacity="0.6" />
          <circle cx="320" cy="400" r="26" fill="#efe2c4" opacity="0.5" />
          <circle cx="90" cy="90" r="14" fill="#5b4326" opacity="0.4" />
        </g>
      )}
    </svg>
  );
}
