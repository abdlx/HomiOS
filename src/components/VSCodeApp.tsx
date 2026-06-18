import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCw, Code2, X } from 'lucide-react';

interface VSCodeAppProps {
  onClose?: () => void;
  isActive?: boolean;
}

export default function VSCodeApp({ onClose, isActive = true }: VSCodeAppProps) {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [checkKey, setCheckKey] = useState(0);

  // Route through the Nginx reverse proxy on /code/
  const vscodeUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/code/';
    return `${window.location.origin}/code/`;
  }, []);

  useEffect(() => {
    if (!isActive) return;

    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2500);

    fetch(`${vscodeUrl}/healthz`, {
      mode: 'no-cors',
      signal: controller.signal,
    })
      .then(() => {
        if (!cancelled) setIsOnline(true);
      })
      .catch(() => {
        if (!cancelled) setIsOnline(false);
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [vscodeUrl, checkKey, isActive]);

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-[#1e1e1e] text-white">
      <div className="h-12 flex items-center justify-between px-4 border-b border-white/10 bg-[#252526] flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#0066b8] to-[#007acc] flex items-center justify-center shadow-lg">
            <Code2 size={17} strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-tight truncate">VS Code (code-server)</h2>
            <p className="text-[11px] text-white/50 leading-tight truncate">{vscodeUrl}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCheckKey((key) => key + 1)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition"
            title="Refresh status"
          >
            <RefreshCw size={15} />
          </button>
          <button
            onClick={() => window.open(vscodeUrl, '_blank', 'noopener,noreferrer')}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition"
            title="Open in new tab"
          >
            <ExternalLink size={15} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-red-500/70 transition"
              title="Close"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      <div className="relative flex-1 bg-[#1e1e1e]">
        {isOnline === false && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-6 bg-[#1e1e1e]">
            <div className="max-w-md text-center">
              <div className="mx-auto mb-5 w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-blue-400">
                <Code2 size={28} strokeWidth={1.7} />
              </div>
              <h3 className="text-lg font-semibold mb-2">VS Code is starting or not installed.</h3>
              <p className="text-sm text-white/55 mb-5">
                OpenFinder will load VS Code here once `code-server` is running locally.
                To install it on your server, run:<br />
                <code className="bg-black/30 p-1 rounded mt-2 block text-xs">curl -fsSL https://code-server.dev/install.sh | sh</code>
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setCheckKey((key) => key + 1)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition"
                >
                  Check Again
                </button>
                <button
                  onClick={() => window.open(vscodeUrl, '_blank', 'noopener,noreferrer')}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-semibold transition"
                >
                  Open /code/
                </button>
              </div>
            </div>
          </div>
        )}

        {isActive && isOnline !== false && (
          <iframe
            key={checkKey}
            src={vscodeUrl}
            title="VS Code"
            className="absolute inset-0 w-full h-full border-0 bg-[#1e1e1e]"
            allow="clipboard-read; clipboard-write; fullscreen"
          />
        )}
      </div>
    </div>
  );
}
