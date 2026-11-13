import type { ComponentProps } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { FieldShell, type FieldMessageProps } from '../TextField/FieldShell';
import { controlClass } from '../TextField/fieldStyles';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends
    FieldMessageProps,
    Omit<ComponentProps<'select'>, 'onChange' | 'value' | 'defaultValue' | 'size' | 'children'> {
  /** Selected option value; `''` means nothing is selected (shows the placeholder). */
  value: string;
  onChange?: (value: string) => void;
  options: readonly SelectOption[];
  /** Text of the empty, non-selectable first option. */
  placeholder?: string;
}

/** Native `<select>` with the kit's look; the platform picker handles touch and keyboard. */
export function Select({
  label,
  help,
  error,
  id,
  className,
  value,
  onChange,
  options,
  placeholder,
  ...selectProps
}: SelectProps) {
  return (
    <FieldShell label={label} help={help} error={error} id={id} className={className}>
      {(control) => (
        <div className="relative">
          <select
            {...selectProps}
            {...control}
            value={value}
            onChange={(event) => onChange?.(event.target.value)}
            className={`${controlClass} appearance-none pr-10 ${value === '' ? 'text-label-secondary' : ''}`}
          >
            {placeholder !== undefined ? (
              <option value="" disabled>
                {placeholder}
              </option>
            ) : null}
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronsUpDown
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-label-secondary"
          />
        </div>
      )}
    </FieldShell>
  );
}
