'use client';

import { FormEvent, useState } from 'react';

export function SharePasswordGate({ token, hint }: { token: string; hint: string | null }) {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!password.trim()) {
      setError('Enter the access code.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/share/verification/${token}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.message || 'Invalid code');
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlock report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface px-6 py-16">
      <div className="mx-auto w-full max-w-md rounded-scholar border border-border bg-surface-alt p-6">
        <h1 className="text-2xl font-semibold text-text">Protected Decision Pack</h1>
        <p className="mt-2 text-sm text-text-soft">
          This shared report requires an access code.
        </p>
        {hint ? (
          <p className="mt-2 text-xs text-text-soft">Hint: {hint}</p>
        ) : null}

        <form className="mt-5 space-y-3" onSubmit={onSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter access code"
            className="w-full rounded-scholar border border-border bg-surface px-3 py-2 text-sm text-text"
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-scholar bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {submitting ? 'Verifying…' : 'Unlock Report'}
          </button>
        </form>

        {error ? <p className="mt-3 text-sm text-error">{error}</p> : null}
      </div>
    </div>
  );
}
