import type { InputHTMLAttributes } from 'react';

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  name: string;
  label: string;
  hint?: string;
  error?: string | undefined;
}

export function FormField({ name, label, hint, error, ...inputProps }: FormFieldProps) {
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = error ? `${name}-error` : undefined;

  return (
    <div>
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        className={`bg-background mt-1.5 w-full rounded-md border px-3 py-2 text-sm ${
          error ? 'border-danger' : 'border-border'
        }`}
        {...inputProps}
      />
      {hint && !error && (
        <p id={hintId} className="text-muted mt-1.5 text-xs">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-danger mt-1.5 text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
