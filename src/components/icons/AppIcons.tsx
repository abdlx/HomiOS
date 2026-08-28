import React, { useId } from 'react';

/**
 * Bespoke, dimensional app icons.
 *
 * Each icon is a complete 64×64 composition — its own rounded "squircle" tile,
 * a top gloss highlight, a rim light, and layered artwork that actually depicts
 * the app (a folder, a terminal window, the Photos pinwheel, a compass, …). This
 * replaces the old "single Lucide line-glyph on a flat gradient" look.
 *
 * Sizing comes from the className (w-…/h-…), so the same icon fills a dock slot or
 * a desktop tile. IDs are namespaced with useId() so gradients/clips never collide
 * when an icon is rendered in more than one place.
 */

function Squircle({ u, from, to, children }: { u: string; from: string; to: string; children: React.ReactNode }) {
  return (
    <>
      <defs>
        <linearGradient id={`${u}-bg`} x1="13" y1="5" x2="52" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
        <linearGradient id={`${u}-edge`} x1="32" y1="2" x2="32" y2="62" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity="0.72" />
          <stop offset="0.48" stopColor="#ffffff" stopOpacity="0.12" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.28" />
        </linearGradient>
        <radialGradient id={`${u}-shine`} cx="0" cy="0" r="1" gradientTransform="translate(18 10) rotate(47) scale(45 38)" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity="0.36" />
          <stop offset="0.55" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <filter id={`${u}-tile-shadow`} x="-30%" y="-25%" width="160%" height="175%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="3.2" stdDeviation="2.8" floodColor="#07101f" floodOpacity="0.42" />
        </filter>
        <filter id={`${u}-art-shadow`} x="-35%" y="-35%" width="170%" height="185%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="2.2" stdDeviation="1.5" floodColor="#07101f" floodOpacity="0.32" />
        </filter>
        <clipPath id={`${u}-clip`}>
          <rect x="4" y="2" width="56" height="56" rx="15" />
        </clipPath>
      </defs>
      {/* A visible lower shell makes the icon read as a tiny physical object. */}
      <rect x="4" y="5" width="56" height="57" rx="15" fill={to} opacity="0.72" filter={`url(#${u}-tile-shadow)`} />
      <rect x="4" y="2" width="56" height="56" rx="15" fill={`url(#${u}-bg)`} />
      <g clipPath={`url(#${u}-clip)`}>
        <rect x="4" y="2" width="56" height="56" fill={`url(#${u}-shine)`} />
        <g filter={`url(#${u}-art-shadow)`}>{children}</g>
        <path d="M4 45c12 7 44 7 56-2v15H4z" fill="#000000" fillOpacity="0.07" />
      </g>
      <rect x="4.6" y="2.6" width="54.8" height="54.8" rx="14.4" fill="none" stroke={`url(#${u}-edge)`} strokeWidth="1.2" />
      <path d="M17 59.5h30" stroke="#ffffff" strokeOpacity="0.16" strokeLinecap="round" />
    </>
  );
}

function Folder({ u }: { u: string }) {
  return (
    <Squircle u={u} from="#48A7FF" to="#0A63E4">
      <defs>
        <linearGradient id={`${u}-f`} x1="20" y1="27" x2="43" y2="53" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" />
          <stop offset="1" stopColor="#D6E6FF" />
        </linearGradient>
        <linearGradient id={`${u}-folder-front`} x1="32" y1="33" x2="32" y2="52" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F8FBFF" />
          <stop offset="1" stopColor="#BDD8FF" />
        </linearGradient>
      </defs>
      <path d="M13 24.5a3.5 3.5 0 0 1 3.5-3.5h8.2a4 4 0 0 1 2.8 1.2l3.1 3.1H49a3 3 0 0 1 3 3v5H13z" fill="#A9CEFF" />
      <path d="M16 27h34l-2.2 17.5a4 4 0 0 1-4 3.5H20.2a4 4 0 0 1-4-3.5z" fill={`url(#${u}-f)`} opacity="0.78" />
      <path d="M12.5 32h39L49 49a4 4 0 0 1-4 3.4H19a4 4 0 0 1-4-3.4z" fill={`url(#${u}-folder-front)`} />
      <path d="M14 33h36.5" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" opacity="0.9" />
      <path d="M18 49.5h28" stroke="#8DB9F4" strokeLinecap="round" opacity="0.65" />
    </Squircle>
  );
}

function Terminal({ u }: { u: string }) {
  return (
    <Squircle u={u} from="#4A4A4E" to="#1B1B1D">
      {/* screen */}
      <rect x="11" y="14" width="42" height="36" rx="7" fill="#08090B" stroke="#ffffff" strokeOpacity="0.2" />
      <rect x="12" y="15" width="40" height="9" rx="6" fill="#3A3A3F" />
      <rect x="12" y="20" width="40" height="4" fill="#3A3A3F" />
      <circle cx="18" cy="19.5" r="1.6" fill="#FF5F57" />
      <circle cx="24" cy="19.5" r="1.6" fill="#FEBC2E" />
      <circle cx="30" cy="19.5" r="1.6" fill="#28C840" />
      {/* prompt chevron + cursor */}
      <path d="M18 30l5.8 5-5.8 5" stroke="#56F08A" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <rect x="28" y="37.5" width="10" height="2.7" rx="1.35" fill="#F4F4F5" />
      <path d="M16 46.5h32" stroke="#ffffff" strokeOpacity="0.07" />
    </Squircle>
  );
}

function Settings({ u }: { u: string }) {
  return (
    <Squircle u={u} from="#A0A0A6" to="#5C5C62">
      <defs>
        <radialGradient id={`${u}-gear`} cx="0.4" cy="0.35" r="0.75">
          <stop stopColor="#FCFCFD" />
          <stop offset="1" stopColor="#D2D2D7" />
        </radialGradient>
        <linearGradient id={`${u}-gear-edge`} x1="32" y1="10" x2="32" y2="54" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#A9A9B0" />
        </linearGradient>
      </defs>
      <g transform="translate(32 32)">
        {Array.from({ length: 12 }).map((_, i) => (
          <rect key={i} x="-2.6" y="-22" width="5.2" height="9" rx="1.8" fill={`url(#${u}-gear-edge)`} transform={`rotate(${i * 30})`} />
        ))}
        <circle cy="1.5" r="15.5" fill="#4A4A50" opacity="0.45" />
        <circle r="15" fill={`url(#${u}-gear)`} />
        <circle r="15" fill="none" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="0.8" />
        <circle r="7" fill="#55555B" />
        <circle cy="-1" r="4.6" fill="#76767D" />
        <circle r="6.5" fill="none" stroke="#3F3F45" strokeOpacity="0.6" strokeWidth="1.2" />
      </g>
    </Squircle>
  );
}

function Activity({ u }: { u: string }) {
  return (
    <Squircle u={u} from="#43C6F2" to="#0F73B8">
      <defs>
        <linearGradient id={`${u}-screen`} x1="16" y1="18" x2="47" y2="47" gradientUnits="userSpaceOnUse">
          <stop stopColor="#123D54" />
          <stop offset="1" stopColor="#061D2C" />
        </linearGradient>
        <linearGradient id={`${u}-a`} x1="14" y1="0" x2="50" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5AE0FF" />
          <stop offset="1" stopColor="#8CF0C4" />
        </linearGradient>
      </defs>
      <rect x="10.5" y="15" width="43" height="34" rx="7" fill={`url(#${u}-screen)`} stroke="#B8EEFF" strokeOpacity="0.42" />
      <path d="M15 23h34M15 31h34M15 39h34" stroke="#67D9FF" strokeOpacity="0.1" />
      <path d="M23 19v26M32 19v26M41 19v26" stroke="#67D9FF" strokeOpacity="0.08" />
      <path d="M14 34h6l3.2-9 5 17 4-12 2.8 6H50" stroke={`url(#${u}-a)`} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="50" cy="30" r="2.2" fill="#8CF0C4" />
    </Squircle>
  );
}

function Coolify({ u }: { u: string }) {
  return (
    <Squircle u={u} from="#8C52FF" to="#5B13D5">
      <g transform="translate(11.68, 11.69) scale(0.0748)">
        <path
          d="M63.7-161.7h-90.9v272.8h90.9zm0 363.7h363.7v-90.9H63.7zm0-363.7h363.7v-90.9H63.7z"
          transform="translate(97.664 323.016)"
          fill="#ffffff"
          fillOpacity={0.23}
        />
        <path
          d="M63.7-161.7h-90.9v272.8h90.9zm0 363.7h363.7v-90.9H63.7zm0-363.7h363.7v-90.9H63.7z"
          transform="translate(77.406 302.758)"
          fill="#ffffff"
          fillOpacity={0.5}
        />
        <path
          d="M63.7-161.7h-90.9v272.8h90.9zm0 363.7h363.7v-90.9H63.7zm0-363.7h363.7v-90.9H63.7z"
          transform="translate(58.147 283.5)"
          fill="#ffffff"
        />
      </g>
    </Squircle>
  );
}

function Notes({ u }: { u: string }) {
  return (
    <Squircle u={u} from="#FFD75E" to="#F4A620">
      <defs>
        <linearGradient id={`${u}-paper`} x1="19" y1="16" x2="43" y2="51" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#EEF1F6" />
        </linearGradient>
      </defs>
      <rect x="16" y="16.5" width="32" height="35" rx="4.5" fill="#B87108" opacity="0.42" />
      <rect x="16" y="14" width="32" height="35" rx="4.5" fill={`url(#${u}-paper)`} />
      <rect x="16" y="14" width="32" height="9" rx="4.5" fill="#FFD84B" />
      <rect x="16" y="19" width="32" height="4" fill="#FFD84B" />
      <g stroke="#C9CDD6" strokeWidth="1.8" strokeLinecap="round">
        <path d="M21 30h22" />
        <path d="M21 36h22" />
        <path d="M21 42h14" />
      </g>
      <path d="M41 49h3a4 4 0 0 0 4-4v-3z" fill="#D6DCE7" />
    </Squircle>
  );
}

function CodeEditor({ u }: { u: string }) {
  return (
    <Squircle u={u} from="#3AA0FF" to="#1E5FCF">
      <defs>
        <linearGradient id={`${u}-editor`} x1="15" y1="18" x2="49" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#173A6A" />
          <stop offset="1" stopColor="#08162D" />
        </linearGradient>
      </defs>
      <rect x="10.5" y="15" width="43" height="34" rx="7" fill={`url(#${u}-editor)`} stroke="#8CC9FF" strokeOpacity="0.35" />
      <path d="M36 16v32" stroke="#ffffff" strokeOpacity="0.09" />
      <rect x="16" y="22" width="11" height="2.6" rx="1.3" fill="#FF9F0A" />
      <rect x="16" y="28" width="16" height="2.6" rx="1.3" fill="#30D158" />
      <rect x="20" y="34" width="12" height="2.6" rx="1.3" fill="#64D2FF" />
      <rect x="16" y="40" width="8" height="2.6" rx="1.3" fill="#BF5AF2" />
      <path d="M41 25l5.5 6-5.5 6" stroke="#ffffff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Squircle>
  );
}

function CodexSpark({ u }: { u: string }) {
  return (
    <Squircle u={u} from="#17BE92" to="#0A6F55">
      <defs>
        <radialGradient id={`${u}-orb`} cx="0.35" cy="0.28" r="0.75">
          <stop stopColor="#DFFFF4" />
          <stop offset="0.55" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#BEEBDD" />
        </radialGradient>
      </defs>
      <path
        d="M32 13c1.9 9.9 6.1 14.1 16 16-9.9 1.9-14.1 6.1-16 16-1.9-9.9-6.1-14.1-16-16 9.9-1.9 14.1-6.1 16-16z"
        fill={`url(#${u}-orb)`}
      />
      {/* companion sparks */}
      <path d="M46.5 40c.8 4.1 2.5 5.8 6.5 6.5-4 .7-5.7 2.4-6.5 6.5-.8-4.1-2.5-5.8-6.5-6.5 4-.7 5.7-2.4 6.5-6.5z" fill="#ffffff" fillOpacity="0.75" />
      <circle cx="18.5" cy="45.5" r="2.1" fill="#ffffff" fillOpacity="0.65" />
    </Squircle>
  );
}

function Immich({ u }: { u: string }) {
  const colors = ['#ef4444', '#f59e0b', '#84cc16', '#06b6d4', '#6366f1', '#d946ef'];
  return (
    <Squircle u={u} from="#ffffff" to="#e5e7eb">
      <g transform="translate(32 32)">
        {colors.map((color, index) => (
          <g key={color} transform={`rotate(${index * 60}) translate(0 -8)`}>
            <ellipse cy="1.2" rx="5.7" ry="13" fill="#111827" fillOpacity="0.2" />
            <ellipse rx="5.5" ry="13" fill={color} fillOpacity="0.96" />
            <ellipse cy="-3" rx="2.2" ry="6" fill="#ffffff" fillOpacity="0.22" />
          </g>
        ))}
        <circle cy="1" r="5.3" fill="#CBD2DC" opacity="0.55" />
        <circle r="5" fill="#ffffff" />
      </g>
    </Squircle>
  );
}

function AppStore({ u }: { u: string }) {
  return (
    <Squircle u={u} from="#7C73FF" to="#4A37D4">
      <defs>
        <linearGradient id={`${u}-bag`} x1="21" y1="18" x2="43" y2="51" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#DDE4FF" />
        </linearGradient>
      </defs>
      <path d="M17 25h30l3 25H14z" fill={`url(#${u}-bag)`} stroke="#ffffff" strokeOpacity="0.7" />
      <path d="M24 27v-4.5a8 8 0 0 1 16 0V27" fill="none" stroke="#DDE4FF" strokeWidth="3.5" strokeLinecap="round" />
      <g transform="translate(32 38) rotate(45)">
        <rect x="-8" y="-8" width="7" height="7" rx="2" fill="#42C9FF" />
        <rect x="1" y="-8" width="7" height="7" rx="2" fill="#8D75FF" />
        <rect x="-8" y="1" width="7" height="7" rx="2" fill="#31D19A" />
        <rect x="1" y="1" width="7" height="7" rx="2" fill="#FFB643" />
      </g>
      <path d="M18 48h28" stroke="#9AA7E8" strokeOpacity="0.5" strokeLinecap="round" />
    </Squircle>
  );
}

function Globe({ u, from, to }: { u: string; from: string; to: string }) {
  return (
    <Squircle u={u} from={from} to={to}>
      <g stroke="#ffffff" strokeOpacity="0.92" strokeWidth="2" fill="none">
        <circle cx="32" cy="32" r="15" />
        <ellipse cx="32" cy="32" rx="6.5" ry="15" strokeWidth="1.6" />
        <path d="M17.5 27h29M17.5 37h29" strokeWidth="1.6" />
      </g>
    </Squircle>
  );
}

const RENDERERS: Record<string, (u: string) => React.ReactNode> = {
  files: (u) => <Folder u={u} />,
  terminal: (u) => <Terminal u={u} />,
  settings: (u) => <Settings u={u} />,
  activity: (u) => <Activity u={u} />,
  coolify: (u) => <Coolify u={u} />,
  immich: (u) => <Immich u={u} />,
  notes: (u) => <Notes u={u} />,
  vscode: (u) => <CodeEditor u={u} />,
  codex: (u) => <CodexSpark u={u} />,
  'app-store': (u) => <AppStore u={u} />,
};

export function AppIcon({
  id,
  colorClass,
  className,
}: {
  id: string;
  colorClass?: string;
  className?: string;
}) {
  const u = useId().replace(/:/g, '');
  const render = RENDERERS[id];
  // Dynamic apps (e.g. deployed Coolify services) fall back to a globe tinted with
  // whatever gradient the app config carries.
  const hexes = (colorClass?.match(/#[0-9a-fA-F]{6}/g) as string[] | null) || ['#14B8A6', '#0F766E'];

  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-hidden="true">
      {render ? render(u) : <Globe u={u} from={hexes[0]} to={hexes[1] || hexes[0]} />}
    </svg>
  );
}

export default AppIcon;
