import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function GoogleConnected() {
  const router = useRouter();
  const ok = router.query.status === 'success';

  useEffect(() => {
    if (!router.isReady) return;
    const timer = window.setTimeout(() => router.replace('/files'), 1200);
    return () => window.clearTimeout(timer);
  }, [router]);

  return (
    <main className="min-h-screen grid place-items-center bg-slate-950 text-white">
      <div className="text-center space-y-2">
        <div className={`mx-auto h-10 w-10 rounded-full grid place-items-center ${ok ? 'bg-emerald-500' : 'bg-rose-500'}`}>
          {ok ? '✓' : '!'}
        </div>
        <h1 className="text-lg font-semibold">{ok ? 'Cloud account connected' : 'Could not connect cloud account'}</h1>
        <p className="text-sm text-slate-400">Returning to HomiOS Files…</p>
      </div>
    </main>
  );
}
