import { useState, type ComponentProps } from 'react';
import { FieldShell, type FieldMessageProps } from '../TextField/FieldShell';
import { controlClass } from '../TextField/fieldStyles';

export interface NumberFieldProps
  extends
    FieldMessageProps,
    Omit<
      ComponentProps<'input'>,
      'onChange' | 'value' | 'defaultValue' | 'size' | 'type' | 'inputMode' | 'min' | 'max'
    > {
  /** Current value; `null` when the field is empty. */
  value: number | null;
  /** Called with the parsed integer, or `null` when the field is empty or incomplete. */
  onChange?: (value: number | null) => void;
  /** Accept a leading minus sign (e.g. stock adjustments). Off by default. */
  allowNegative?: boolean;
  /** Largest integer magnitude accepted while typing (`|value| <= max`). */
  max?: number;
}

function parse(text: string): number | null {
  return /^-?\d+$/.test(text) ? Number(text) : null;
}

/**
 * Integer-only input. It stays a text input with `inputMode="numeric"` so the browser never
 * rounds or reformats what was typed. Anything that is not a digit is dropped as people type
 * or paste ("1,200" → 1200).
 */
export function NumberField({
  label,
  help,
  error,
  id,
  className,
  value,
  onChange,
  allowNegative = false,
  max = Number.MAX_SAFE_INTEGER,
  onBlur,
  ...inputProps
}: NumberFieldProps) {
  // Raw text, so partial input such as "-" or "007" survives while typing.
  const [text, setText] = useState(value === null ? '' : String(value));
  // Show the typed text while it still means `value`; otherwise the parent changed the value.
  const shown = parse(text) === value ? text : value === null ? '' : String(value);

  const sanitize = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    return allowNegative && raw.trimStart().startsWith('-') ? `-${digits}` : digits;
  };

  return (
    <FieldShell label={label} help={help} error={error} id={id} className={className}>
      {(control) => (
        <input
          {...inputProps}
          {...control}
          type="text"
          inputMode="numeric"
          pattern={allowNegative ? '-?[0-9]*' : '[0-9]*'}
          autoComplete="off"
          value={shown}
          onChange={(event) => {
            const next = sanitize(event.target.value);
            const parsed = parse(next);
            if (parsed !== null && (!Number.isSafeInteger(parsed) || Math.abs(parsed) > max)) {
              return;
            }
            setText(next);
            onChange?.(parsed);
          }}
          onBlur={(event) => {
            // Normalize leftovers such as "007" or a lone "-" once people leave the field.
            setText(value === null ? '' : String(value));
            onBlur?.(event);
          }}
          className={`${controlClass} tabular-nums`}
        />
      )}
    </FieldShell>
  );
}
