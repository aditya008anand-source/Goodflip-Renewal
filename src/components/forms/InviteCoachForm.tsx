'use client';

import { useRef, useState, useTransition } from 'react';
import { inviteCoach } from '@/app/(dashboard)/settings/actions';

export default function InviteCoachForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    setLink(null);
    setCopied(false);
    startTransition(async () => {
      try {
        const actionLink = await inviteCoach(formData);
        setLink(actionLink);
        formRef.current?.reset();
      } catch (e: any) {
        setError(e.message);
      }
    });
  }

  function copyLink() {
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopied(true);
  }

  return (
    <div className="space-y-2">
      <form ref={formRef} action={handleSubmit} className="flex gap-2 items-start">
        <input type="text" name="name" placeholder="Full name" required className="input" />
        <input type="email" name="email" placeholder="person@tatvacare.in" required className="input" />
        <select name="role" className="input" defaultValue="coach">
          <option value="coach">Coach</option>
          <option value="admin">Admin</option>
        </select>
        <button type="submit" disabled={isPending} className="btn-primary shrink-0">
          {isPending ? 'Generating link…' : 'Generate invite link'}
        </button>
      </form>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {link && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-md px-3 py-2">
          <p className="text-xs text-slate-700 flex-1 break-all">
            Invite link ready — copy and send it to them yourself (WhatsApp, email, etc.):{' '}
            <span className="font-mono">{link}</span>
          </p>
          <button type="button" onClick={copyLink} className="btn-primary shrink-0 text-xs">
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      )}
    </div>
  );
}
