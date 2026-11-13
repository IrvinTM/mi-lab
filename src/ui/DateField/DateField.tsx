import type { ComponentProps } from 'react';
import { FieldShell, type FieldMessageProps } from '../TextField/FieldShell';
import { controlClass } from '../TextField/fieldStyles';

export interface DateFieldProps
  extends
    FieldMessageProps,
    Omit<ComponentProps<'input'>, 'onChange' | 'value' | 'defaultValue' | 'size' | 'type'> {
  /** `YYYY-MM-DD`, or `''` when empty. Never converted to a `Date`. */
  value: string;
  /** Called with `YYYY-MM-DD`, or `''` when the field is cleared or incomplete. */
  onChange?: (value: string) => void;
}

/** Native date picker. The value is the business date string, so there is no timezone shift. */
export function DateField({
  label,
  help,
  error,
  id,
  className,
  value,
  onChange,
  ...inputProps
}: DateFieldProps) {
  return (
    <FieldShell label={label} help={help} error={error} id={id} className={className}>
      {(control) => (
        <input
          {...inputProps}
          {...control}
          type="date"
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          className={`${controlClass} appearance-none text-left tabular-nums`}
        />
      )}
    </FieldShell>
  );
}
