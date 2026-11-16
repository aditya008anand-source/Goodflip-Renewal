'use client';

import { useRef, useState, useTransition } from 'react';
import { requestAccess } from './actions';

// Public, unauthenticated page — the one link an admin can send to everyone
// at once (WhatsApp broadcast, etc.) instead of generating + sending a
// separate invite link per person. Anyone can create their login here, but
// they stay unable to sign in until an admin approves them from Settings.
export default function JoinPage() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await requestAccess(formData);
        setDone(true);
        formRef.current?.reset();
      } catch (e: any) {
        setError(e.message);
      }
    });
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
          <h1 className="text-sm font-semibold text-slate-800">Create your account</h1>

          {done ? (
            <p className="text-sm text-green-700">
              Request submitted — your admin will approve your account, then you can log in with
              this email and password.
            </p>
          ) : (
            <form ref={formRef} action={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full name</label>
                <input type="text" name="name" required className="input" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  name="email"
                  required
                  className="input"
                  placeholder="you@tatvacare.in"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                <input type="password" name="password" required className="input" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Confirm password
                </label>
                <input type="password" name="confirmPassword" required className="input" />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button type="submit" disabled={isPending} className="btn-primary w-full">
                {isPending ? 'Submitting…' : 'Request access'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
