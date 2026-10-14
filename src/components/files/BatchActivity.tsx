import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Button } from '../ui/surfaces';
import type { Submission } from '../../hooks/useFileOperations';
type Item = Submission & { status: string; progress: number; error?: string };
export default function BatchActivity({ items, onRetry, onClear }: { items: Item[]; onRetry: (item: Item) => void; onClear: () => void }) {
  if (!items.length) return null;
  const groups = new Map<string, Item[]>(); items.forEach(item => groups.set(item.batchId, [...groups.get(item.batchId) || [], item]));
  return <div className="max-h-40 shrink-0 overflow-auto border-t border-neutral-200/60 bg-white/50 px-4 py-2 dark:border-white/10 dark:bg-white/[.02]" aria-label="File operation batches">{[...groups].map(([id, batch]) => {
    const completed = batch.filter(item => item.status === 'completed').length, failed = batch.filter(item => ['failed', 'cancelled'].includes(item.status));
    const pending = batch.length - completed - failed.length;
    const Icon = pending ? Loader2 : failed.length ? XCircle : CheckCircle2;
    return <details key={id} className="text-xs"><summary className="flex min-h-9 cursor-pointer items-center gap-3"><Icon size={15} className={pending ? 'animate-spin text-blue-500' : failed.length ? 'text-red-500' : 'text-emerald-500'}/><span className="flex-1">{batch[0].action === 'move' ? 'Moving' : 'Copying'} {batch.length} items · {completed} completed{failed.length ? ` · ${failed.length} need attention` : ''}{pending ? ` · ${pending} pending` : ''}</span>{!pending && <Button onClick={event => { event.preventDefault(); onClear(); }}>Clear finished</Button>}</summary><div className="space-y-1 pb-2">{batch.map((item, index) => <div key={index} className="flex items-center gap-2 py-1 pl-7"><span className="min-w-0 flex-1 truncate">{item.item.name}</span><span className="max-w-[50%] truncate text-neutral-400" title={item.error}>{item.error || item.status}</span>{['failed', 'cancelled'].includes(item.status) && <Button onClick={() => onRetry(item)}>Retry</Button>}</div>)}</div></details>;
  })}</div>;
}
