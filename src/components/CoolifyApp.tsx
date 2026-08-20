import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCw, Server, X } from 'lucide-react';

interface CoolifyAppProps {
  onClose?: () => void;
  isActive?: boolean;
}

export default function CoolifyApp({ onClose, isActive = true }: CoolifyAppProps) {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null);
  const [port, setPort] = useState(8000);
  const [checkKey, setCheckKey] = useState(0);

  const coolifyUrl = useMemo(() => {
    if (typeof window === 'undefined') return `http://localhost:${port}`;
    return `${window.location.protocol}//${window.location.hostname}:${port}`;
  }, [port]);

  useEffect(() => {
    if (!isActive) return;

    let cancelled = false;
    const controller = new AbortController();
    fetch('/api/integrations/status', { cache: 'no-store', signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Status unavailable')))
      .then((data) => {
        if (!cancelled) {
          setIsEnabled(data.coolify.enabled);
          setIsOnline(data.coolify.online);
          setPort(data.coolify.port);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsEnabled(false);
          setIsOnline(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [checkKey, isActive]);

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-[#0b1120] text-white">
      <div className="h-12 flex items-center justify-between px-4 border-b border-white/10 bg-black/30 backdrop-blur-xl flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg">
            <Server size={17} strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-tight truncate">Coolify</h2>
            <p className="text-[11px] text-white/50 leading-tight truncate">{coolifyUrl}</p>
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
            onClick={() => window.open(coolifyUrl, '_blank', 'noopener,noreferrer')}
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

      <div className="relative flex-1 bg-[#080d18]">
        {isOnline === false && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-6 bg-[#0b1120]">
            <div className="max-w-md text-center">
              <div className="mx-auto mb-5 w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-cyan-300">
                <Server size={28} strokeWidth={1.7} />
              </div>
              <h3 className="text-lg font-semibold mb-2">{isEnabled ? 'Coolify is starting.' : 'Coolify is not installed.'}</h3>
              <p className="text-sm text-white/55 mb-5">
                {isEnabled ? 'HomiOS will load Coolify when the optional service becomes reachable.' : 'Re-run the installer with --with-coolify, or run homios-update --with-coolify.'}
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setCheckKey((key) => key + 1)}
                  className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-sm font-semibold transition"
                >
                  Check Again
                </button>
                <button
                  onClick={() => window.open(coolifyUrl, '_blank', 'noopener,noreferrer')}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-semibold transition"
                >
                  Open Service
                </button>
              </div>
            </div>
          </div>
        )}

        {isActive && isEnabled && isOnline && (
          <iframe
            key={checkKey}
            src={coolifyUrl}
            title="Coolify"
            className="absolute inset-0 w-full h-full border-0 bg-white"
            allow="clipboard-read; clipboard-write; fullscreen"
          />
        )}
      </div>
    </div>
  );
}
