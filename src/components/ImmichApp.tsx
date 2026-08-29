import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Images, RefreshCw, X } from 'lucide-react';

interface ImmichAppProps {
  onClose?: () => void;
  isActive?: boolean;
}

type ImmichStatus = { enabled: boolean; online: boolean; port: number };

export default function ImmichApp({ onClose, isActive = true }: ImmichAppProps) {
  const [status, setStatus] = useState<ImmichStatus | null>(null);
  const [checkKey, setCheckKey] = useState(0);
  const port = status?.port || 2283;
  const immichUrl = useMemo(() => {
    if (typeof window === 'undefined') return `http://localhost:${port}`;
    return `${window.location.protocol}//${window.location.hostname}:${port}`;
  }, [port]);

  useEffect(() => {
    if (!isActive) return;
    const controller = new AbortController();
    fetch('/api/integrations/status', { cache: 'no-store', signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Status unavailable')))
      .then((data) => setStatus(data.immich))
      .catch((error) => {
        if (error.name !== 'AbortError') setStatus({ enabled: false, online: false, port: 2283 });
      });
    return () => controller.abort();
  }, [checkKey, isActive]);

  const unavailable = status && (!status.enabled || !status.online);

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-[#111827] text-white">
      <div className="h-12 flex items-center justify-between px-4 border-b border-white/10 bg-black/25 backdrop-blur-xl flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-fuchsia-500 via-rose-500 to-amber-400 flex items-center justify-center shadow-lg">
            <Images size={17} strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-tight truncate">Immich</h2>
            <p className="text-[11px] text-white/50 leading-tight truncate">{immichUrl}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCheckKey((key) => key + 1)} className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition" title="Refresh status">
            <RefreshCw size={15} />
          </button>
          <button onClick={() => window.open(immichUrl, '_blank', 'noopener,noreferrer')} className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition" title="Open in new tab">
            <ExternalLink size={15} />
          </button>
          {onClose && <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-red-500/70 transition" title="Close"><X size={15} /></button>}
        </div>
      </div>

      <div className="relative flex-1 bg-[#0b1020]">
        {unavailable && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
            <div className="max-w-md text-center">
              <div className="mx-auto mb-5 w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-fuchsia-300"><Images size={28} strokeWidth={1.7} /></div>
              <h3 className="text-lg font-semibold mb-2">{status.enabled ? 'Immich is starting.' : 'Immich is not installed.'}</h3>
              <p className="text-sm text-white/55 mb-5">
                {status.enabled ? 'The Immich integration is configured but has not become reachable yet.' : 'Install and manage Immich separately, then configure its HomiOS integration environment.'}
              </p>
              <button onClick={() => setCheckKey((key) => key + 1)} className="px-4 py-2 rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 text-white text-sm font-semibold transition">Check Again</button>
            </div>
          </div>
        )}
        {isActive && status?.enabled && status.online && (
          <iframe key={checkKey} src={immichUrl} title="Immich" className="absolute inset-0 w-full h-full border-0 bg-white" allow="camera; clipboard-read; clipboard-write; fullscreen" />
        )}
      </div>
    </div>
  );
}
