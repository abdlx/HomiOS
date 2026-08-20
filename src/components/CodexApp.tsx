import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCw, Sparkles, X, ShieldAlert } from 'lucide-react';

interface CodexAppProps {
  onClose?: () => void;
  isActive?: boolean;
}

type CodexStatus = 'checking' | 'online' | 'offline' | 'unauthorized';

export default function CodexApp({ onClose, isActive = true }: CodexAppProps) {
  const [status, setStatus] = useState<CodexStatus>('checking');
  const [checkKey, setCheckKey] = useState(0);

  // Served by the HomiOS server itself: session-gated proxy to codex-web-ui.
  const codexUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/codex/';
    return `${window.location.origin}/codex/`;
  }, []);

  useEffect(() => {
    if (!isActive) return;

    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4000);

    fetch('/codex/', { cache: 'no-store', signal: controller.signal })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setStatus('online');
        else if (res.status === 401 || res.status === 403) setStatus('unauthorized');
        else setStatus('offline');
      })
      .catch(() => {
        if (!cancelled) setStatus('offline');
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [checkKey, isActive]);

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-[#0a0a0a] text-white">
      <div className="h-12 flex items-center justify-between px-4 border-b border-white/10 bg-[#141414] flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#10A37F] to-[#0B7A5E] flex items-center justify-center shadow-lg">
            <Sparkles size={17} strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-tight truncate">Codex</h2>
            <p className="text-[11px] text-white/50 leading-tight truncate">{codexUrl}</p>
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
            onClick={() => window.open(codexUrl, '_blank', 'noopener,noreferrer')}
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

      <div className="relative flex-1 bg-[#0a0a0a]">
        {status === 'unauthorized' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-6 bg-[#0a0a0a]">
            <div className="max-w-md text-center">
              <div className="mx-auto mb-5 w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-amber-400">
                <ShieldAlert size={28} strokeWidth={1.7} />
              </div>
              <h3 className="text-lg font-semibold mb-2">Administrator access required.</h3>
              <p className="text-sm text-white/55 mb-5">
                Codex can run commands on this server, so it is only available to
                HomiOS administrator accounts.
              </p>
              <button
                onClick={() => setCheckKey((key) => key + 1)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition"
              >
                Check Again
              </button>
            </div>
          </div>
        )}

        {status === 'offline' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-6 bg-[#0a0a0a]">
            <div className="max-w-md text-center">
              <div className="mx-auto mb-5 w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-emerald-400">
                <Sparkles size={28} strokeWidth={1.7} />
              </div>
              <h3 className="text-lg font-semibold mb-2">Codex is starting or not installed.</h3>
              <p className="text-sm text-white/55 mb-5">
                HomiOS will load Codex here once the `codex-web` service is running.
                It is installed by the HomiOS installer; on the server check:<br />
                <code className="bg-black/30 p-1 rounded mt-2 block text-xs">sudo systemctl status codex-web</code>
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setCheckKey((key) => key + 1)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition"
                >
                  Check Again
                </button>
                <button
                  onClick={() => window.open(codexUrl, '_blank', 'noopener,noreferrer')}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-semibold transition"
                >
                  Open /codex/
                </button>
              </div>
            </div>
          </div>
        )}

        {isActive && (status === 'online' || status === 'checking') && (
          <iframe
            key={checkKey}
            src={codexUrl}
            title="Codex"
            className="absolute inset-0 w-full h-full border-0 bg-[#0a0a0a]"
            allow="clipboard-read; clipboard-write; fullscreen; microphone"
          />
        )}
      </div>
    </div>
  );
}
