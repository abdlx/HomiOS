import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Transfer } from '@/types';

type TransferInput = Omit<Transfer, 'id' | 'createdAt' | 'status' | 'progress'> & {
  run: (update: (patch: Partial<Transfer>) => void) => Promise<void>;
};

type TransferContextValue = {
  transfers: Transfer[];
  addTransfer(input: TransferInput): Promise<void>;
  clearFinished(): void;
};

const TransferContext = createContext<TransferContextValue | null>(null);

export function TransferProvider({ children }: { children: React.ReactNode }) {
  const [transfers, setTransfers] = useState<Transfer[]>([]);

  const updateTransfer = useCallback((id: string, patch: Partial<Transfer>) => {
    setTransfers((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const addTransfer = useCallback(async (input: TransferInput) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const transfer: Transfer = {
      id,
      instanceId: input.instanceId,
      name: input.name,
      type: input.type,
      status: 'running',
      progress: 0,
      message: input.message,
      retry: input.retry,
      createdAt: new Date().toISOString(),
    };
    setTransfers((items) => [transfer, ...items]);
    try {
      await input.run((patch) => updateTransfer(id, patch));
      updateTransfer(id, { status: 'completed', progress: 100, message: 'Done' });
    } catch (error: any) {
      updateTransfer(id, { status: 'failed', message: error?.message || 'Failed' });
    }
  }, [updateTransfer]);

  const clearFinished = useCallback(() => {
    setTransfers((items) => items.filter((item) => item.status === 'running'));
  }, []);

  const value = useMemo(() => ({ transfers, addTransfer, clearFinished }), [addTransfer, clearFinished, transfers]);
  return <TransferContext.Provider value={value}>{children}</TransferContext.Provider>;
}

export function useTransfers() {
  const value = useContext(TransferContext);
  if (!value) throw new Error('useTransfers must be used within TransferProvider');
  return value;
}
