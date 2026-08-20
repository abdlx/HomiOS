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
        <linearGradient id={`${u}-bg`} x1="32" y1="3" x2="32" y2="61" gradientUnits="userSpaceOnUse">
          <stop stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
        <clipPath id={`${u}-clip`}>
          <rect x="3" y="3" width="58" height="58" rx="15.5" />
        </clipPath>
      </defs>
      <rect x="3" y="3" width="58" height="58" rx="15.5" fill={`url(#${u}-bg)`} />
      <g clipPath={`url(#${u}-clip)`}>
        {/* soft top gloss */}
        <ellipse cx="32" cy="1" rx="42" ry="23" fill="#ffffff" fillOpacity="0.16" />
        {children}
        {/* faint inner bottom shade for depth */}
        <rect x="3" y="46" width="58" height="15" fill="#000000" fillOpacity="0.05" />
      </g>
      {/* rim light + hairline edge */}
      <rect x="3.6" y="3.6" width="56.8" height="56.8" rx="15" fill="none" stroke="#ffffff" strokeOpacity="0.22" />
      <rect x="3" y="3" width="58" height="58" rx="15.5" fill="none" stroke="#000000" strokeOpacity="0.07" />
    </>
  );
}

function Folder({ u }: { u: string }) {
  return (
    <Squircle u={u} from="#3A3A3E" to="#1C1C1E">
      <defs>
        <linearGradient id={`${u}-f`} x1="32" y1="27" x2="32" y2="51" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F4F4F6" />
          <stop offset="1" stopColor="#B0B0B8" />
        </linearGradient>
      </defs>
      {/* back tab peeking above */}
      <path d="M13 25.5a3 3 0 0 1 3-3h8.7a3 3 0 0 1 2.1.9l2.4 2.4a3 3 0 0 0 2.1.9H49a3 3 0 0 1 3 3v2H13z" fill="#636366" />
      {/* body */}
      <rect x="13" y="28.5" width="39" height="22" rx="4.5" fill={`url(#${u}-f)`} />
      {/* top lip highlight + inner line for depth */}
      <rect x="13" y="28.5" width="39" height="5" rx="2.5" fill="#ffffff" />
      <rect x="13" y="33.5" width="39" height="1.2" fill="#000000" fillOpacity="0.18" />
    </Squircle>
  );
}

function Terminal({ u }: { u: string }) {
  return (
    <Squircle u={u} from="#4A4A4E" to="#1B1B1D">
      {/* screen */}
      <rect x="12" y="15" width="40" height="34" rx="6" fill="#0E0E10" />
      <rect x="12" y="15" width="40" height="9" rx="6" fill="#2E2E31" />
      <rect x="12" y="21" width="40" height="3" fill="#2E2E31" />
      <circle cx="18" cy="19.5" r="1.6" fill="#FF5F57" />
      <circle cx="24" cy="19.5" r="1.6" fill="#FEBC2E" />
      <circle cx="30" cy="19.5" r="1.6" fill="#28C840" />
      {/* prompt chevron + cursor */}
      <path d="M18 30.5l5.5 4.5-5.5 4.5" stroke="#30D158" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <rect x="27.5" y="37" width="9.5" height="2.6" rx="1.3" fill="#EDEDED" />
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
      </defs>
      <g transform="translate(32 32)">
        {Array.from({ length: 12 }).map((_, i) => (
          <rect key={i} x="-2.5" y="-22" width="5" height="9" rx="1.8" fill="#E9E9EE" transform={`rotate(${i * 30})`} />
        ))}
        <circle r="15" fill={`url(#${u}-gear)`} />
        <circle r="15" fill="none" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="0.8" />
        <circle r="6.5" fill="#6A6A70" />
        <circle r="6.5" fill="none" stroke="#3F3F45" strokeOpacity="0.6" strokeWidth="1.2" />
      </g>
    </Squircle>
  );
}

function Activity({ u }: { u: string }) {
  return (
    <Squircle u={u} from="#43C6F2" to="#0F73B8">
      <rect x="11" y="16" width="42" height="32" rx="6" fill="#082A3D" fillOpacity="0.82" />
      <defs>
        <linearGradient id={`${u}-a`} x1="14" y1="0" x2="50" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5AE0FF" />
          <stop offset="1" stopColor="#8CF0C4" />
        </linearGradient>
      </defs>
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
          transform="translate(84.664 310.016)"
          fill="#ffffff"
          fillOpacity={0.35}
        />
        <path
          d="M63.7-161.7h-90.9v272.8h90.9zm0 363.7h363.7v-90.9H63.7zm0-363.7h363.7v-90.9H63.7z"
          transform="translate(71.406 296.758)"
          fill="#ffffff"
          fillOpacity={0.65}
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
      <rect x="16" y="15" width="32" height="35" rx="4.5" fill="#ffffff" />
      <rect x="16" y="15" width="32" height="8" rx="4.5" fill="#FFC83D" />
      <rect x="16" y="20" width="32" height="3" fill="#FFC83D" />
      <g stroke="#C9CDD6" strokeWidth="1.8" strokeLinecap="round">
        <path d="M21 30h22" />
        <path d="M21 36h22" />
        <path d="M21 42h14" />
      </g>
    </Squircle>
  );
}

function CodeEditor({ u }: { u: string }) {
  return (
    <Squircle u={u} from="#3AA0FF" to="#1E5FCF">
      <rect x="11" y="16" width="42" height="32" rx="6" fill="#0C1B34" fillOpacity="0.92" />
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
      {/* main four-point AI spark */}
      <path
        d="M32 13c1.9 9.9 6.1 14.1 16 16-9.9 1.9-14.1 6.1-16 16-1.9-9.9-6.1-14.1-16-16 9.9-1.9 14.1-6.1 16-16z"
        fill="#ffffff"
        fillOpacity="0.96"
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
        {colors.map((color, index) => <ellipse key={color} rx="5.5" ry="13" fill={color} fillOpacity="0.92" transform={`rotate(${index * 60}) translate(0 -8)`} />)}
        <circle r="5" fill="#ffffff" />
      </g>
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
