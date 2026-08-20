import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import { AlertCircle, ArrowLeft, ShieldCheck } from 'lucide-react';
import { getSession, isAppInitialized } from '../lib/auth';
import AuthShell, { Field, SubmitButton, inputClass } from '../src/components/auth/AuthShell';

export async function getServerSideProps(context: any) {
  if (!isAppInitialized()) {
    return { redirect: { destination: '/setup/admin', permanent: false } };
  }
  const session = await getSession(context.req);
  if (session) {
    return { redirect: { destination: '/dashboard', permanent: false } };
  }
  return { props: {} };
}

type Step = 'credentials' | 'totp';

export default function Login() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const totpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 'totp') requestAnimationFrame(() => totpRef.current?.focus());
  }, [step]);

  async function submit(payload: Record<string, string>) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      // The backend asks for a second factor by returning 200 { totpRequired: true }.
      if (res.ok && data?.totpRequired) {
        setStep('totp');
        return;
      }
      if (res.ok && data?.ok) {
        router.replace('/dashboard');
        return;
      }
      setError(data?.error || 'Something went wrong. Please try again.');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  const onCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    submit({ email: email.trim(), password });
  };

  const onTotp = (e: React.FormEvent) => {
    e.preventDefault();
    submit({ email: email.trim(), password, totp: totp.trim() });
  };

  return (
    <AuthShell
      title={step === 'credentials' ? 'Welcome back' : 'Two-factor authentication'}
      subtitle={
        step === 'credentials'
          ? 'Sign in to your HomiOS workspace'
          : 'Enter the 6-digit code from your authenticator app'
      }
      footer={<>Self-hosted with HomiOS</>}
    >
      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 dark:border-red-500/25 bg-red-50 dark:bg-red-500/10 px-3.5 py-2.5 text-[13px] text-red-700 dark:text-red-300"
        >
          <AlertCircle size={16} className="mt-px flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {step === 'credentials' ? (
        <form onSubmit={onCredentials} className="space-y-4">
          <Field label="Email">
            <input
              type="email"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputClass}
            />
          </Field>

          <Field label="Password">
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className={inputClass}
            />
          </Field>

          <SubmitButton type="submit" loading={loading} disabled={loading || !email || !password}>
            {loading ? 'Signing in…' : 'Sign in'}
          </SubmitButton>
        </form>
      ) : (
        <form onSubmit={onTotp} className="space-y-4">
          <div className="flex justify-center">
            <div className="grid place-items-center w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-500/15 text-blue-500 dark:text-blue-300">
              <ShieldCheck size={22} />
            </div>
          </div>

          <Field
            label="Authentication code"
            hint={<span className="text-[11.5px] text-slate-400 dark:text-slate-500">or a recovery code</span>}
          >
            <input
              ref={totpRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={totp}
              onChange={(e) => setTotp(e.target.value)}
              placeholder="123 456"
              className={`${inputClass} text-center tracking-[0.4em] font-medium`}
            />
          </Field>

          <SubmitButton type="submit" loading={loading} disabled={loading || !totp}>
            {loading ? 'Verifying…' : 'Verify'}
          </SubmitButton>

          <button
            type="button"
            onClick={() => { setStep('credentials'); setTotp(''); setError(''); }}
            className="w-full flex items-center justify-center gap-1.5 text-[13px] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            <ArrowLeft size={14} /> Back to sign in
          </button>
        </form>
      )}
    </AuthShell>
  );
}
