import { useState, useEffect, useCallback } from 'react';

export type PWAAppId = 'files' | 'notes' | 'home';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

interface UsePWAInstallReturn {
  /** True if the browser supports PWA installation */
  canInstall: boolean;
  /** Whether the chooser sheet is open */
  isChooserOpen: boolean;
  /** Open the app chooser */
  openChooser: () => void;
  /** Close the app chooser */
  closeChooser: () => void;
  /** Trigger install for a specific app */
  installApp: (appId: PWAAppId) => Promise<void>;
  /** Whether currently running as a PWA */
  isStandalone: boolean;
  /** Which pwa context we're in, if any */
  pwaContext: string | null;
}

export function usePWAInstall(): UsePWAInstallReturn {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isChooserOpen, setIsChooserOpen] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [pwaContext, setPwaContext] = useState<string | null>(null);

  useEffect(() => {
    // Detect standalone mode
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    // Detect pwa context from URL
    const params = new URLSearchParams(window.location.search);
    setPwaContext(params.get('pwa'));

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const openChooser = useCallback(() => {
    setIsChooserOpen(true);
  }, []);

  const closeChooser = useCallback(() => {
    setIsChooserOpen(false);
  }, []);

  const installApp = useCallback(async (appId: PWAAppId) => {
    // Inject the appropriate manifest link before triggering install
    const manifestMap: Record<PWAAppId, string> = {
      files: '/manifest-files.json',
      notes: '/manifest-notes.json',
      home: '/manifest.json',
    };

    // Swap the manifest link
    let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      document.head.appendChild(link);
    }
    const prevManifest = link.href;
    link.href = manifestMap[appId];

    try {
      if (deferredPrompt) {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          setDeferredPrompt(null);
        }
      } else {
        // iOS / manual instructions fallback
        // The UI will handle showing instructions
      }
    } finally {
      // Restore manifest for the full app experience
      link.href = prevManifest;
      setIsChooserOpen(false);
    }
  }, [deferredPrompt]);

  return {
    canInstall: !!deferredPrompt || /iphone|ipad|ipod|android/i.test(navigator.userAgent),
    isChooserOpen,
    openChooser,
    closeChooser,
    installApp,
    isStandalone,
    pwaContext,
  };
}
