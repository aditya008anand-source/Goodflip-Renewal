'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// Reached by clicking the invite link an admin generates in Settings. The
// link itself carries a one-time Supabase session in the URL hash — this
// page's job is to wait for the browser client to pick that up, then let
// the person choose the password they'll actually log in with from now on.
export default function SetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [ready, setReady] = useState(false);
  const [invalidLink, setInvalidLink] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) setReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setReady(true);
    });

    // If no session shows up in a few seconds, the link was already used,
    // expired, or opened without its hash (e.g. pasted somewhere that strips
    // it) — tell the person instead of leaving them on a dead form.
    const timeout = setTimeout(() => {
      if (!cancelled) {
        supabase.auth.getSession().then(({ data }) => {
          if (!cancelled && !data.session) setInvalidLink(true);
        });
      }
    }, 5000);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    document.cookie = `mysaathi_login_at=${Date.now()}; path=/; max-age=${60 * 60 * 24}`;
    router.push('/overview');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-bg px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="h-9 w-9 rounded-lg bg-brand-700 flex items-center justify-center text-white font-bold">
            M
          </div>
          <div>
            <p className="font-semibold text-slate-900 leading-tight">MySaathi</p>
            <p className="text-xs text-slate-500 leading-tight">Renewal Management Portal</p>
          </div>
        </div>

        <div className="card space-y-4">
          <h1 className="text-sm font-semibold text-slate-800">Set your password</h1>

          {invalidLink ? (
            <p className="text-sm text-red-600">
              This invite link is invalid or has expired. Ask your admin to generate a new one for
              you from Settings.
            </p>
          ) : !ready ? (
            <p className="text-sm text-slate-500">Checking your invite link…</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">New password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    className="input pr-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500"
                    tabIndex={-1}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Confirm password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  className="input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? 'Saving…' : 'Set password & continue'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
