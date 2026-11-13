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
