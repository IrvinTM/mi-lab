import { useRef, type KeyboardEvent } from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  /** Visible label (Spanish, noun or noun phrase). */
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  /** Accessible name of the group, e.g. "Área". Not rendered visually. */
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * Single-choice control implemented as a `radiogroup` with a roving tabindex: Tab enters the
 * group on the selected segment, arrow keys move AND select (wrapping), Home/End jump to the ends.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className = '',
}: SegmentedControlProps<T>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = options.findIndex((option) => option.value === value);
  // With no valid selection the first segment must still be reachable with Tab.
  const tabbableIndex = selectedIndex === -1 ? 0 : selectedIndex;

  const select = (index: number) => {
    const option = options[index];
    if (!option) return;
    buttons.current[index]?.focus();
    if (option.value !== value) onChange(option.value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = buttons.current.findIndex((button) => button === event.target);
    if (current === -1) return;
    const last = options.length - 1;
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = current === last ? 0 : current + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = current === 0 ? last : current - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    select(next);
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={handleKeyDown}
      className={`flex min-h-11 w-full gap-0.5 rounded-md bg-fill p-0.5 ${className}`}
    >
      {options.map((option, index) => (
        <button
          key={option.value}
          ref={(element) => {
            buttons.current[index] = element;
          }}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={index === tabbableIndex ? 0 : -1}
          onClick={() => select(index)}
          className="flex min-h-10 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-sm px-3 text-subheadline text-label transition-colors duration-150 aria-checked:bg-bg-elevated aria-checked:font-semibold aria-checked:shadow-sm"
        >
          <span className="truncate">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
