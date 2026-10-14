import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Linking } from 'react-native';
import { SharedMediaItem } from '@/types';

type SharedMediaContextValue = {
  sharedItems: SharedMediaItem[];
  isShareModalVisible: boolean;
  openShareModal: (items: SharedMediaItem[]) => void;
  closeShareModal: () => void;
  clearSharedItems: () => void;
};

const SharedMediaContext = createContext<SharedMediaContextValue | null>(null);

export function SharedMediaProvider({ children }: { children: React.ReactNode }) {
  const [sharedItems, setSharedItems] = useState<SharedMediaItem[]>([]);
  const [isShareModalVisible, setIsShareModalVisible] = useState(false);

  const openShareModal = useCallback((items: SharedMediaItem[]) => {
    if (items.length > 0) {
      setSharedItems(items);
      setIsShareModalVisible(true);
    }
  }, []);

  const closeShareModal = useCallback(() => {
    setIsShareModalVisible(false);
  }, []);

  const clearSharedItems = useCallback(() => {
    setSharedItems([]);
    setIsShareModalVisible(false);
  }, []);

  // Listen to incoming deep links e.g. homifiles://share?uri=... or files
  useEffect(() => {
    const handleUrl = (event: { url: string }) => {
      try {
        const rawUrl = event.url;
        if (rawUrl.startsWith('homifiles://')) {
          const match = rawUrl.match(/[?&]uri=([^&]+)/);
          const nameMatch = rawUrl.match(/[?&]name=([^&]+)/);
          if (match && match[1]) {
            const uriStr = decodeURIComponent(match[1]);
            const name = nameMatch && nameMatch[1] ? decodeURIComponent(nameMatch[1]) : 'shared-file';
            openShareModal([{ uri: uriStr, name, type: 'shared' }]);
          }
        }
      } catch (err) {
        console.warn('[SharedMediaContext] deep link parse error:', err);
      }
    };

    Linking.getInitialURL().then((url: string | null) => {
      if (url) handleUrl({ url });
    });

    const subscription = Linking.addEventListener('url', handleUrl);
    return () => subscription.remove();
  }, [openShareModal]);

  return (
    <SharedMediaContext.Provider
      value={{
        sharedItems,
        isShareModalVisible,
        openShareModal,
        closeShareModal,
        clearSharedItems,
      }}
    >
      {children}
    </SharedMediaContext.Provider>
  );
}

export function useSharedMedia() {
  const context = useContext(SharedMediaContext);
  if (!context) {
    throw new Error('useSharedMedia must be used within SharedMediaProvider');
  }
  return context;
}
