import { useEffect, useId, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from '../Button';
import { useModalDialog } from '../internal/useModalDialog';
import './sheet.css';

export interface SheetProps {
  open: boolean;
  /** Esc, the close button and a click on the backdrop all call this. */
  onClose: () => void;
  /** Visible title; also the accessible name of the dialog. */
  title: string;
  children: ReactNode;
}

// Keep the content mounted while the exit animation runs (matches --duration-base).
const EXIT_MS = 250;

/**
 * Modal sheet on a native `<dialog>`: bottom sheet below 600 px, centered modal above.
 * Content is unmounted after it closes, so forms start fresh every time.
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const titleId = useId();
  const { ref, dialogProps } = useModalDialog({ open, onClose, dismissOnBackdrop: true });

  const [wasOpen, setWasOpen] = useState(open);
  const [exiting, setExiting] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    setExiting(!open);
  }
  useEffect(() => {
    if (!exiting) return;
    const timer = setTimeout(() => setExiting(false), EXIT_MS);
    return () => clearTimeout(timer);
  }, [exiting]);

  return (
    <dialog ref={ref} className="sheet" aria-labelledby={titleId} {...dialogProps}>
      <div className="sheet-panel">
        {(open || exiting) && (
          <>
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-separator py-2 pr-2 pl-4">
              <h2 id={titleId} className="text-headline font-semibold text-label">
                {title}
              </h2>
              <IconButton icon={X} aria-label="Cerrar" onClick={onClose} />
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
          </>
        )}
      </div>
    </dialog>
  );
}
