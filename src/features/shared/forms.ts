import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

/** Parses a decimal typed by a person ("2,5" or "2.5"); `null` if empty, `NaN` if not a number. */
export function parseDecimal(text: string): number | null {
  const clean = text.trim().replace(',', '.');
  if (clean === '') return null;
  return /^\d*\.?\d+$|^\d+\.$/.test(clean) ? Number(clean) : Number.NaN;
}

/** Closes a sheet route: back if there is history to go back to, otherwise to the home page. */
export function useCloseSheet(): () => void {
  const navigate = useNavigate();
  const { key } = useLocation();
  return () => {
    if (key === 'default') void navigate('/');
    else void navigate(-1);
  };
}

/**
 * After a submit that failed validation, moves focus to the first invalid field so keyboard and
 * screen reader users land on the problem (the field announces its error via `aria-describedby`).
 * Put `ref` on the form and call `focusFirstInvalid()` when a submit is rejected.
 */
export function useFocusFirstInvalid() {
  const ref = useRef<HTMLFormElement>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (attempt === 0) return;
    ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [attempt]);
  return { ref, focusFirstInvalid: () => setAttempt((count) => count + 1) };
}
