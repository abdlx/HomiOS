import { useState, useEffect } from 'react';

const DEFAULT_USERNAME = "User";

export function useUsername(fallback = DEFAULT_USERNAME) {
  const [username, setUsername] = useState(fallback);

  useEffect(() => {
    const saved = localStorage.getItem('homios_username');
    if (saved) {
      setUsername(saved);
    }
  }, []);

  const changeUsername = (name: string) => {
    setUsername(name);
    localStorage.setItem('homios_username', name);
    window.dispatchEvent(new CustomEvent('usernameChanged', { detail: name }));
  };

  useEffect(() => {
    const handleSync = (e: Event) => {
      const customEvent = e as CustomEvent;
      setUsername(customEvent.detail);
    };
    window.addEventListener('usernameChanged', handleSync);
    return () => window.removeEventListener('usernameChanged', handleSync);
  }, []);

  return { username, changeUsername };
}
