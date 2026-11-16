'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setLoading(false);
      setError(signInError.message);
      return;
    }

    // Self-signups (via /join) stay unapproved until an admin flips it on in
    // Settings — block them here rather than letting them into the app.
    const { data: profile } = await supabase
      .from('users')
      .select('approved')
      .eq('id', signInData.user.id)
      .maybeSingle();

    setLoading(false);

    if (profile && profile.approved === false) {
      await supabase.auth.signOut();
      setError('Your account is awaiting admin approval. Please check back once approved.');
      return;
    }

    // Marks when this session started, read by middleware to force a
    // sign-out after 24 hours regardless of activity. Expires on its own
    // after 24h too, as a second safety net.
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

        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@tatvacare.in"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
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

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="text-xs text-slate-400 text-center pt-2">
            New here?{' '}
            <a href="/join" className="text-brand-700 underline">
              Create your account
            </a>{' '}
            — your admin will approve it before you can sign in.
          </p>
        </form>
      </div>
    </div>
  );
}
