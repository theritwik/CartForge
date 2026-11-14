export function FormError({ message }: { message: string | undefined }) {
  // The live region stays mounted so screen readers announce a message when it appears.
  return (
    <div role="alert">
      {message && (
        <p className="border-danger text-danger rounded-md border px-3 py-2 text-sm">{message}</p>
      )}
    </div>
  );
}

export function SubmitButton({
  isSubmitting,
  label,
  submittingLabel,
}: {
  isSubmitting: boolean;
  label: string;
  submittingLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={isSubmitting}
      className="bg-foreground text-background w-full rounded-md px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {isSubmitting ? submittingLabel : label}
    </button>
  );
}
