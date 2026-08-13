import React from 'react';
import { CheckCircle, Loader2, PauseCircle, Play, RotateCcw, Trash2, XCircle, X } from 'lucide-react';
import { TransferTask } from '../types';

interface TransferCenterProps {
  transfers: TransferTask[];
  isMobile?: boolean;
  onClearFinished: () => void;
  onCancel?: (id: string) => void;
  onRetry?: (task: TransferTask) => void;
  onTogglePause?: (task: TransferTask) => void;
}

export default function TransferCenter({
  transfers,
  isMobile = false,
  onClearFinished,
  onCancel,
  onRetry,
  onTogglePause,
}: TransferCenterProps) {
  if (transfers.length === 0) return null;

  const activeCount = transfers.filter((t) => t.status === 'uploading' || t.status === 'pending').length;

  return (
    <div
      className={`fixed right-6 w-80 bg-white dark:bg-[#1f1f22] shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.5)] border border-neutral-200 dark:border-white/10 rounded-2xl overflow-hidden z-[215] flex flex-col transition-[bottom,max-height] duration-200 ${isMobile ? 'left-6 right-6 w-auto' : ''}`}
      style={{
        bottom: `calc(${isMobile ? '5rem' : '1.5rem'} + var(--openfinder-activity-panel-offset, 0px))`,
        maxHeight: `min(430px, calc(100dvh - ${isMobile ? '6rem' : '2.5rem'} - var(--openfinder-activity-panel-offset, 0px)))`,
      }}
    >
      <div className="bg-neutral-50 dark:bg-white/5 px-4 py-2 border-b border-neutral-200 dark:border-white/10 flex justify-between items-center">
        <span className="text-xs font-bold text-neutral-600 dark:text-neutral-300">Transfers ({activeCount} active)</span>
        <button onClick={onClearFinished} className="text-[10px] text-blue-600 hover:underline font-semibold cursor-pointer">
          Clear Finished
        </button>
      </div>
      <div className="overflow-y-auto p-2 space-y-2 flex-1">
        {transfers.map((task) => {
          const isActive = task.status === 'uploading' || task.status === 'pending';
          return (
            <div key={task.id} className="bg-neutral-50 dark:bg-white/5 border border-neutral-100 dark:border-white/10 p-3 rounded-xl flex items-center space-x-3">
              <div className="flex-shrink-0">
                {task.status === 'pending' && <Loader2 size={16} className="text-neutral-400" />}
                {task.status === 'uploading' && <Loader2 size={16} className="text-blue-500 animate-spin" />}
                {task.status === 'paused' && <PauseCircle size={16} className="text-amber-500" />}
                {task.status === 'completed' && <CheckCircle size={16} className="text-green-500" />}
                {task.status === 'error' && <XCircle size={16} className="text-red-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-200 truncate block">{task.name}</span>
                  <span className="text-[10px] text-neutral-400 dark:text-neutral-500 ml-2 flex-shrink-0">{task.progress}%</span>
                </div>
                <div className="w-full bg-neutral-200 dark:bg-white/10 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${task.status === 'error' ? 'bg-red-500' : task.status === 'paused' ? 'bg-amber-400' : task.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'}`}
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
                {task.bytesTotal && (
                  <p className="text-[9px] text-neutral-400 mt-0.5 font-mono">
                    {((task.bytesUploaded ?? 0) / 1024 / 1024).toFixed(1)} / {(task.bytesTotal / 1024 / 1024).toFixed(1)} MB
                  </p>
                )}
                {(task.description || task.error) && (
                  <p className="text-[9px] text-neutral-400 mt-0.5 truncate">{task.error || task.description}</p>
                )}
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                {task.tusUpload && (task.status === 'uploading' || task.status === 'paused') && (
                  <button onClick={() => onTogglePause?.(task)} className="p-1.5 rounded-lg border border-neutral-200 dark:border-white/10 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/10" title={task.status === 'uploading' ? 'Pause' : 'Resume'}>
                    {task.status === 'uploading' ? <PauseCircle size={13} /> : <Play size={13} />}
                  </button>
                )}
                {task.status === 'error' && task.retryable && (
                  <button onClick={() => onRetry?.(task)} className="p-1.5 rounded-lg border border-neutral-200 dark:border-white/10 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/10" title="Retry">
                    <RotateCcw size={13} />
                  </button>
                )}
                {isActive && task.cancellable && (
                  <button onClick={() => onCancel?.(task.id)} className="p-1.5 rounded-lg border border-neutral-200 dark:border-white/10 text-neutral-500 dark:text-neutral-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10" title="Cancel">
                    <X size={13} />
                  </button>
                )}
                {!isActive && (
                  <button onClick={onClearFinished} className="p-1.5 rounded-lg text-neutral-300 hover:text-neutral-500" title="Clear finished">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
