import { useEffect, useRef, type ComponentProps } from 'react';
import { CircleX, Search } from 'lucide-react';
import { FieldShell, type FieldMessageProps } from '../TextField/FieldShell';
import { controlClass } from '../TextField/fieldStyles';

export interface SearchFieldProps
  extends
    FieldMessageProps,
    Omit<ComponentProps<'input'>, 'onChange' | 'value' | 'defaultValue' | 'size' | 'type' | 'ref'> {
  value: string;
  onChange?: (value: string) => void;
  /** Keeps the label for screen readers but hides it visually (e.g. inside a toolbar). */
  hideLabel?: boolean;
  /** Pressing `/` focuses this field. Turn off when a page has more than one search field. */
  shortcut?: boolean;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !==
      null
  );
}

/** Search input with a leading icon, a Clear button and the `/` focus shortcut. */
export function SearchField({
  label,
  help,
  error,
  id,
  className,
  value,
  onChange,
  hideLabel = false,
  shortcut = true,
  placeholder = 'Buscar',
  disabled,
  onKeyDown,
  ...inputProps
}: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!shortcut) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.defaultPrevented || event.isComposing) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [shortcut]);

  const clear = () => {
    onChange?.('');
    inputRef.current?.focus();
  };

  return (
    <FieldShell
      label={label}
      help={help}
      error={error}
      id={id}
      hideLabel={hideLabel}
      className={className}
    >
      {(control) => (
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-label-secondary"
          />
          <input
            {...inputProps}
            {...control}
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder={placeholder}
            disabled={disabled}
            value={value}
            onChange={(event) => onChange?.(event.target.value)}
            onKeyDown={(event) => {
              onKeyDown?.(event);
              if (event.key === 'Escape' && value !== '' && !event.defaultPrevented) {
                event.preventDefault();
                clear();
              }
            }}
            className={`${controlClass} pr-(--hit-target) pl-10 [&::-webkit-search-cancel-button]:appearance-none`}
          />
          {value !== '' && !disabled ? (
            <button
              type="button"
              aria-label="Borrar búsqueda"
              onClick={clear}
              className="absolute top-0 right-0 flex h-full w-(--hit-target) items-center justify-center rounded-md text-label-secondary"
            >
              <CircleX aria-hidden="true" className="size-5" />
            </button>
          ) : null}
        </div>
      )}
    </FieldShell>
  );
}
