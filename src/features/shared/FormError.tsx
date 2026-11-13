import { CircleAlert } from 'lucide-react';

/** A problem with the whole form (not one field), announced as soon as it appears. */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-sm bg-red/15 px-3 py-2 text-footnote text-label"
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {message}
    </p>
  );
}
