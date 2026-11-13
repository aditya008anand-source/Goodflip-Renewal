'use client';

import { useRef, useState, useTransition } from 'react';
import { inviteCoach } from '@/app/(dashboard)/settings/actions';

export default function InviteCoachForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await inviteCoach(formData);
        formRef.current?.reset();
      } catch (e: any) {
        setError(e.message);
      }
    });
  }

  return (
    <form ref={formRef} action={handleSubmit} className="flex gap-2 items-start">
      <input type="text" name="name" placeholder="Full name" required className="input" />
      <input type="email" name="email" placeholder="person@tatvacare.in" required className="input" />
      <select name="role" className="input" defaultValue="coach">
        <option value="coach">Coach</option>
        <option value="admin">Admin</option>
      </select>
      <button type="submit" disabled={isPending} className="btn-primary shrink-0">
        {isPending ? 'Sending invite…' : 'Send invite'}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}
