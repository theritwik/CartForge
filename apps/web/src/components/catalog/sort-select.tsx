'use client';

import { useRouter } from 'next/navigation';

interface SortChoice {
  value: string;
  label: string;
  href: string;
}

export function SortSelect({ value, choices }: { value: string; choices: SortChoice[] }) {
  const router = useRouter();

  return (
    <label className="text-muted flex items-center gap-2 text-sm">
      Sort by
      <select
        value={value}
        onChange={(event) => {
          const choice = choices.find((candidate) => candidate.value === event.target.value);
          if (choice) {
            router.push(choice.href);
          }
        }}
        className="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm"
      >
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </label>
  );
}
