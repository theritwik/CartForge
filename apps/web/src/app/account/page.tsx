import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LogoutButton } from '@/components/auth/logout-button';
import { getCurrentUser } from '@/lib/current-user';

export const metadata: Metadata = { title: 'Your account' };

const memberSinceFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'long' });
const buttonClass =
  'border-border hover:bg-surface rounded-md border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60';

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login?next=/account');
  }

  const details = [
    { label: 'Name', value: user.name },
    { label: 'Email', value: user.email },
    { label: 'Account type', value: user.role === 'ADMIN' ? 'Administrator' : 'Customer' },
    { label: 'Member since', value: memberSinceFormat.format(user.createdAt) },
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-semibold tracking-tight">Your account</h1>

      <dl className="border-border divide-border mt-8 divide-y rounded-lg border">
        {details.map((detail) => (
          <div key={detail.label} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:gap-6">
            <dt className="text-muted text-sm sm:w-40 sm:shrink-0">{detail.label}</dt>
            <dd className="text-sm break-words">{detail.value}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-10 text-lg font-medium">Sessions</h2>
      <p className="text-muted mt-2 text-sm">
        Signing out of all devices ends every session for this account, including this one.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <LogoutButton className={buttonClass} />
        <LogoutButton everywhere className={buttonClass} />
      </div>
    </div>
  );
}
