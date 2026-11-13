import { useId, type ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';

/** Props every form field shares: a visible label plus optional help and error text. */
export interface FieldMessageProps {
  /** Visible label. Always rendered so the field's purpose never depends on a placeholder. */
  label: ReactNode;
  /** Hint shown under the control (format, unit, example). */
  help?: ReactNode;
  /** Error message. Marks the control `aria-invalid` and is announced with it. */
  error?: ReactNode;
}

/** Accessibility props the shell hands to the actual control. */
export interface FieldControlProps {
  id: string;
  'aria-invalid': true | undefined;
  'aria-describedby': string | undefined;
}

interface FieldShellProps extends FieldMessageProps {
  /** Id for the control. Generated with `useId()` when omitted. */
  id?: string;
  /** Keeps the label in the accessibility tree but hides it visually. */
  hideLabel?: boolean;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
}

/**
 * Label + control + error/help layout shared by the form fields. It owns the ids so the
 * label (`htmlFor`) and the messages (`aria-describedby`) always point at the right nodes.
 */
export function FieldShell({
  label,
  help,
  error,
  id,
  hideLabel = false,
  className,
  children,
}: FieldShellProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const errorId = `${controlId}-error`;
  const helpId = `${controlId}-help`;
  const hasError = Boolean(error);
  const describedBy = [hasError ? errorId : null, help ? helpId : null].filter(Boolean).join(' ');

  return (
    <div className={['flex flex-col gap-1', className].filter(Boolean).join(' ')}>
      <label
        htmlFor={controlId}
        className={hideLabel ? 'sr-only' : 'text-subheadline font-medium text-label'}
      >
        {label}
      </label>
      {children({
        id: controlId,
        'aria-invalid': hasError ? true : undefined,
        'aria-describedby': describedBy || undefined,
      })}
      {hasError ? (
        <p id={errorId} className="flex items-start gap-1 text-footnote text-label">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger" />
          <span>{error}</span>
        </p>
      ) : null}
      {help ? (
        <p id={helpId} className="text-footnote text-label-secondary">
          {help}
        </p>
      ) : null}
    </div>
  );
}
