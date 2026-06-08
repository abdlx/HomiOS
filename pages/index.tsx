import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Basic redirect for root entry
    // A robust implementation would use Next.js middleware
    // Here we just redirect to the dashboard which will enforce login
    router.push('/dashboard');
  }, [router]);

  return (
    <div className="h-screen flex items-center justify-center bg-slate-900">
      <div className="animate-pulse text-blue-500">Loading OpenFinder...</div>
    </div>
  );
}
