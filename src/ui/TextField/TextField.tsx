import type { ComponentProps } from 'react';
import { FieldShell, type FieldMessageProps } from './FieldShell';
import { controlClass } from './fieldStyles';

export interface TextFieldProps
  extends
    FieldMessageProps,
    Omit<ComponentProps<'input'>, 'onChange' | 'value' | 'defaultValue' | 'size'> {
  value: string;
  onChange?: (value: string) => void;
}

/** Single-line text input with a visible label, help text and an accessible error state. */
export function TextField({
  label,
  help,
  error,
  id,
  className,
  value,
  onChange,
  type = 'text',
  ...inputProps
}: TextFieldProps) {
  return (
    <FieldShell label={label} help={help} error={error} id={id} className={className}>
      {(control) => (
        <input
          {...inputProps}
          {...control}
          type={type}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          className={controlClass}
        />
      )}
    </FieldShell>
  );
}
