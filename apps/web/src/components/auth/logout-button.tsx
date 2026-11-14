'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/lib/api-client';

export function LogoutButton({
  everywhere = false,
  className,
}: {
  /** Also ends this account's sessions on other devices. */
  everywhere?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setIsSubmitting(true);
    setFailed(false);
    const result = await callApi('POST', everywhere ? '/auth/logout-all' : '/auth/logout');
    if (result.ok) {
      router.replace('/');
      router.refresh();
      return;
    }
    setIsSubmitting(false);
    setFailed(true);
  }

  const label = everywhere ? 'Sign out of all devices' : 'Sign out';
  return (
    <>
      <button
        type="button"
        onClick={() => void signOut()}
        disabled={isSubmitting}
        className={className}
      >
        {isSubmitting ? 'Signing out…' : label}
      </button>
      <span role="alert" className="text-danger text-xs">
        {failed && 'Could not sign out. Try again.'}
      </span>
    </>
  );
}
