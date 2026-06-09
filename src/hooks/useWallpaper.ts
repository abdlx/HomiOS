import { useState, useEffect } from 'react';

const DEFAULT_WALLPAPER = "https://images.unsplash.com/photo-1552083375-1447ce886485?q=80&w=1470&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D";

export function useWallpaper() {
  const [wallpaper, setWallpaper] = useState(DEFAULT_WALLPAPER);

  useEffect(() => {
    const saved = localStorage.getItem('openfinder_wallpaper');
    if (saved) {
      setWallpaper(saved);
    }
  }, []);

  const changeWallpaper = (url: string) => {
    setWallpaper(url);
    localStorage.setItem('openfinder_wallpaper', url);
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
