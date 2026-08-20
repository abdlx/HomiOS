import { useState, useEffect } from 'react';

const DEFAULT_WALLPAPER = "/wallpapers/wallpaper-01.jpg";

export function useWallpaper() {
  const [wallpaper, setWallpaper] = useState(DEFAULT_WALLPAPER);

  useEffect(() => {
    const saved = localStorage.getItem('homios_wallpaper');
    // External URLs saved before wallpapers were bundled locally are blocked by
    // the CSP (img-src 'self'), so reset them to the default.
    if (saved && /^https?:\/\//i.test(saved)) {
      localStorage.removeItem('homios_wallpaper');
      return;
    }
    if (saved) {
      setWallpaper(saved);
    }
  }, []);

  const changeWallpaper = (url: string) => {
    setWallpaper(url);
    localStorage.setItem('homios_wallpaper', url);
    window.dispatchEvent(new CustomEvent('wallpaperChanged', { detail: url }));
  };

  useEffect(() => {
    const handleSync = (e: Event) => {
      const customEvent = e as CustomEvent;
      setWallpaper(customEvent.detail);
    };
    window.addEventListener('wallpaperChanged', handleSync);
    return () => window.removeEventListener('wallpaperChanged', handleSync);
  }, []);

  return { wallpaper, changeWallpaper };
}
