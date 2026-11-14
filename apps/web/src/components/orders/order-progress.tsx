import type { ProgressStep } from '@/lib/order-view';

const dotClasses = {
  done: 'bg-foreground border-foreground',
  current: 'border-foreground bg-background',
  upcoming: 'border-border bg-background',
};

export function OrderProgress({ steps }: { steps: ProgressStep[] }) {
  return (
    <ol aria-label="Order progress" className="grid grid-cols-5 gap-2">
      {steps.map((step) => (
        <li
          key={step.label}
          aria-current={step.state === 'current' ? 'step' : undefined}
          className="text-center"
        >
          <span
            className={`mx-auto block h-3 w-3 rounded-full border-2 ${dotClasses[step.state]}`}
            aria-hidden="true"
          />
          <span
            className={`mt-2 block text-xs ${step.state === 'upcoming' ? 'text-muted' : 'font-medium'}`}
          >
            {step.label}
            <span className="sr-only">
              {step.state === 'done'
                ? ' (completed)'
                : step.state === 'current'
                  ? ' (current)'
                  : ''}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
