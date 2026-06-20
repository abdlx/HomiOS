import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Folder, FileText, LayoutDashboard, Share2, ChevronRight, Smartphone, Download, ArrowDown } from 'lucide-react';
import { usePWAInstall, PWAAppId } from '../hooks/usePWAInstall';

interface AppOption {
  id: PWAAppId;
  name: string;
  subtitle: string;
  description: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  gradient: string;
  features: string[];
  manifestUrl: string;
}

const APP_OPTIONS: AppOption[] = [
  {
    id: 'files',
    name: 'Files',
    subtitle: 'File Manager',
    description: 'Upload, browse, and manage all your files. Receive shared files directly from other apps.',
    icon: Folder,
    gradient: 'from-[#0A84FF] via-[#0066D6] to-[#0055B3]',
    features: ['Share files from any app', 'Upload & download', 'Browse all storage'],
    manifestUrl: '/manifest-files.json',
  },
  {
    id: 'notes',
    name: 'Notes',
    subtitle: 'Notes & Markdown',
    description: 'Write, edit and organize your notes. Share text from any app directly into Notes.',
    icon: FileText,
    gradient: 'from-[#F59E0B] via-[#D97706] to-[#B45309]',
    features: ['Share text & URLs', 'Markdown editor', 'Sync across devices'],
    manifestUrl: '/manifest-notes.json',
  },
  {
    id: 'home',
    name: 'OpenFinder',
    subtitle: 'Full Home App',
    description: 'The complete OpenFinder experience — desktop, all apps, and everything in one place.',
    icon: LayoutDashboard,
    gradient: 'from-[#6366F1] via-[#4F46E5] to-[#4338CA]',
    features: ['Full desktop experience', 'All apps included', 'System-wide access'],
    manifestUrl: '/manifest.json',
  },
];

interface IOSInstructions {
  appId: PWAAppId;
  appName: string;
}

function IOSInstallInstructions({ appId, appName, onClose }: IOSInstructions & { onClose: () => void }) {
  const app = APP_OPTIONS.find(a => a.id === appId)!;
  const Icon = app.icon;

  return (
    <div className="flex flex-col items-center text-center px-2 py-4">
      <div className={`w-20 h-20 rounded-[22px] bg-gradient-to-b ${app.gradient} flex items-center justify-center mb-4 shadow-[0_8px_24px_rgba(0,0,0,0.35),inset_0_2px_4px_rgba(255,255,255,0.3)]`}>
        <Icon size={36} strokeWidth={1.5} className="text-white drop-shadow-md" />
      </div>
      <h3 className="text-[17px] font-bold text-white mb-1">Install {appName}</h3>
      <p className="text-white/60 text-[13px] mb-6">Follow these steps to add to your Home Screen</p>

      <div className="w-full space-y-3 text-left">
        {[
          { step: 1, text: 'Tap the Share button', icon: <Share2 size={16} className="text-[#0A84FF]" /> },
          { step: 2, text: 'Scroll down and tap "Add to Home Screen"', icon: <ArrowDown size={16} className="text-[#0A84FF]" /> },
          { step: 3, text: `Tap "Add" to install ${appName}`, icon: <Download size={16} className="text-[#0A84FF]" /> },
        ].map(({ step, text, icon }) => (
          <div key={step} className="flex items-center gap-3 bg-white/5 rounded-2xl px-4 py-3 border border-white/10">
            <div className="w-7 h-7 rounded-full bg-[#0A84FF]/20 flex items-center justify-center flex-shrink-0">
              {icon}
            </div>
            <span className="text-white/90 text-[14px]">{text}</span>
          </div>
        ))}
      </div>

      <button
        onClick={onClose}
        className="mt-6 w-full py-3.5 rounded-2xl bg-white/10 text-white font-semibold text-[15px] active:bg-white/20 transition-colors border border-white/10"
      >
        Got it
      </button>
    </div>
  );
}

export function PWAInstallButton() {
  const { canInstall, isChooserOpen, openChooser, isStandalone } = usePWAInstall();

  if (isStandalone) return null;
  if (!canInstall) return null;

  return (
    <button
      id="pwa-install-btn"
      onClick={openChooser}
      className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 text-white text-[13px] font-semibold hover:bg-white/20 active:scale-95 transition-all"
    >
      <Download size={14} strokeWidth={2.5} />
      <span>Install App</span>
    </button>
  );
}

function PWAInstallChooserInner() {
  const { isChooserOpen, closeChooser, installApp, canInstall } = usePWAInstall();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [selectedApp, setSelectedApp] = useState<PWAAppId | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState<PWAAppId | null>(null);
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  // Detect if beforeinstallprompt is supported (Android/Desktop)
  const [hasNativePrompt, setHasNativePrompt] = useState(false);
  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setHasNativePrompt(true); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async (appId: PWAAppId) => {
    if (isIOS || !hasNativePrompt) {
      // Show step-by-step iOS instructions (or manual browser instructions)
      // First swap the manifest
      const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
      const manifestMap: Record<PWAAppId, string> = {
        files: '/manifest-files.json',
        notes: '/manifest-notes.json',
        home: '/manifest.json',
      };
      if (link) link.href = manifestMap[appId];
      setShowIOSInstructions(appId);
      return;
    }

    setIsInstalling(true);
    setSelectedApp(appId);
    try {
      await installApp(appId);
    } finally {
      setIsInstalling(false);
      setSelectedApp(null);
    }
  };

  if (!isChooserOpen) return null;

  const iosApp = APP_OPTIONS.find(a => a.id === showIOSInstructions);

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col justify-end" onClick={(e) => { if (e.target === e.currentTarget) closeChooser(); }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeChooser} />

      {/* Bottom Sheet */}
      <div
        ref={sheetRef}
        className="relative z-10 bg-[#1c1c1e]/95 backdrop-blur-3xl rounded-t-[32px] border-t border-white/10 shadow-[0_-20px_60px_rgba(0,0,0,0.5)] overflow-hidden"
        style={{ animation: 'slideUp 0.38s cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/25" />
        </div>

        <div className="px-5 pb-safe">
          {showIOSInstructions && iosApp ? (
            <IOSInstallInstructions
              appId={showIOSInstructions}
              appName={iosApp.name}
              onClose={() => { setShowIOSInstructions(null); closeChooser(); }}
            />
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-between py-4">
                <div>
                  <h2 className="text-[20px] font-bold text-white tracking-tight">Add to Home Screen</h2>
                  <p className="text-white/50 text-[13px] mt-0.5">Choose what to install</p>
                </div>
                <button
                  onClick={closeChooser}
                  className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:bg-white/20 active:scale-90 transition-all"
                >
                  <X size={15} />
                </button>
              </div>

              {/* App Options */}
              <div className="space-y-3 mb-6">
                {APP_OPTIONS.map((app) => {
                  const Icon = app.icon;
                  const isLoading = isInstalling && selectedApp === app.id;
                  return (
                    <button
                      key={app.id}
                      id={`install-${app.id}-btn`}
                      onClick={() => handleInstall(app.id)}
                      disabled={isInstalling}
                      className="w-full flex items-center gap-4 p-4 rounded-[20px] bg-white/5 hover:bg-white/10 active:bg-white/15 active:scale-[0.98] border border-white/8 transition-all text-left disabled:opacity-60 group"
                    >
                      {/* App icon */}
                      <div className={`w-14 h-14 rounded-[16px] bg-gradient-to-b ${app.gradient} flex items-center justify-center flex-shrink-0 shadow-[0_6px_16px_rgba(0,0,0,0.4),inset_0_2px_4px_rgba(255,255,255,0.25)] relative overflow-hidden`}>
                        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-white/25" />
                        <Icon size={28} strokeWidth={1.5} className="text-white drop-shadow-md z-10" />
                      </div>

                      {/* App info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-semibold text-[16px] tracking-tight">{app.name}</span>
                          <span className="text-white/40 text-[12px]">·</span>
                          <span className="text-white/50 text-[12px]">{app.subtitle}</span>
                        </div>
                        <p className="text-white/55 text-[12px] mt-0.5 leading-relaxed line-clamp-2">{app.description}</p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {app.features.map(f => (
                            <span key={f} className="text-[10px] px-2 py-0.5 rounded-full bg-white/8 text-white/60 border border-white/8">
                              {f}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Arrow */}
                      <div className="flex-shrink-0">
                        {isLoading ? (
                          <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        ) : (
                          <ChevronRight size={18} className="text-white/30 group-hover:text-white/60 transition-colors" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Share target info */}
              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-[#0A84FF]/10 border border-[#0A84FF]/20 mb-6">
                <Share2 size={15} className="text-[#0A84FF] flex-shrink-0 mt-0.5" />
                <p className="text-[#5AC8FA] text-[12px] leading-relaxed">
                  <span className="text-white/70 font-medium">Files app</span> will appear in your device's share sheet, so you can send photos & documents directly to your storage.
                </p>
              </div>

              {/* Bottom safe area */}
              <div className="h-2" />
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default function PWAInstallChooser() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(<PWAInstallChooserInner />, document.body);
}
