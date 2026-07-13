import { useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { AlertCircle, Check } from 'lucide-react';
import AuthShell, { Field, SubmitButton, inputClass } from '../../src/components/auth/AuthShell';

const MIN_PASSWORD = 12;

/** Cheap, honest strength signal — length plus character-class variety. */
function scorePassword(pw: string): { score: number; label: string; tone: string } {
  if (!pw) return { score: 0, label: '', tone: '' };
  let score = 0;
  if (pw.length >= MIN_PASSWORD) score++;
  if (pw.length >= 16) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const level = Math.min(4, score);
  return [
    { score: 0, label: 'Too short', tone: 'bg-slate-300 dark:bg-slate-600' },
    { score: 1, label: 'Weak', tone: 'bg-red-500' },
    { score: 2, label: 'Fair', tone: 'bg-amber-500' },
    { score: 3, label: 'Good', tone: 'bg-blue-500' },
    { score: 4, label: 'Strong', tone: 'bg-emerald-500' },
  ][level];
}

export default function AdminSetup() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const strength = useMemo(() => scorePassword(password), [password]);
  const longEnough = password.length >= MIN_PASSWORD;
  const canSubmit = !!email && longEnough && !loading;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!longEnough) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        router.push('/setup/drives');
        return;
      }
      setError(data?.error || 'Setup failed. Please try again.');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Set up OpenFinder"
      subtitle="Create the administrator account — the only one with full host access."
      footer={<>This account manages files, storage, and system settings.</>}
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

      <form onSubmit={handleCreate} className="space-y-4">
        <Field label="Email">
          <input
            type="email"
            autoComplete="username"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@example.com"
            className={inputClass}
          />
        </Field>

        <Field
          label="Password"
          hint={
            strength.label && (
              <span className="text-[11.5px] font-medium text-slate-400 dark:text-slate-500">{strength.label}</span>
            )
          }
        >
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 12 characters"
            className={inputClass}
          />
          {/* Strength meter */}
          <div className="mt-2 flex gap-1.5" aria-hidden="true">
            {[1, 2, 3, 4].map((seg) => (
              <div
                key={seg}
                className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                  strength.score >= seg ? strength.tone : 'bg-slate-200 dark:bg-white/10'
                }`}
              />
            ))}
          </div>
          <p
            className={`mt-2 flex items-center gap-1.5 text-[12px] transition-colors ${
              longEnough ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            <Check size={13} className={longEnough ? 'opacity-100' : 'opacity-30'} />
            At least {MIN_PASSWORD} characters
          </p>
        </Field>

        <SubmitButton type="submit" loading={loading} disabled={!canSubmit}>
          {loading ? 'Creating account…' : 'Create account'}
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
