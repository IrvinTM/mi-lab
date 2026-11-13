import { useEffect, useRef, type RefObject } from 'react';

interface Options {
  open: boolean;
  /** Called when the user asks to close (Esc or, if enabled, a click on the backdrop). */
  onClose: () => void;
  dismissOnBackdrop?: boolean;
  /** Element to focus right after opening. Defaults to the browser's own choice. */
  initialFocus?: RefObject<HTMLElement | null>;
}

function restoreFocus(opener: RefObject<HTMLElement | null>) {
  const target = opener.current;
  opener.current = null;
  if (target?.isConnected) target.focus();
}

/**
 * Drives a native `<dialog>` from a controlled `open` prop: `showModal()` gives the focus trap,
 * inert background and top layer; focus returns to the opener on close. Esc is intercepted so the
 * parent stays the single source of truth for `open`.
 */
export function useModalDialog({
  open,
  onClose,
  dismissOnBackdrop = false,
  initialFocus,
}: Options) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const pressStartedOnBackdrop = useRef<boolean | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      initialFocus?.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      restoreFocus(opener);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Unmounting while open must also hand focus back.
  useEffect(
    () => () => {
      if (ref.current?.open) ref.current.close();
      restoreFocus(opener);
    },
    [],
  );

  return {
    ref,
    dialogProps: {
      onCancel(event: React.SyntheticEvent<HTMLDialogElement>) {
        event.preventDefault();
        onClose();
      },
      onPointerDown(event: React.PointerEvent<HTMLDialogElement>) {
        pressStartedOnBackdrop.current = event.target === event.currentTarget;
      },
      onClick(event: React.MouseEvent<HTMLDialogElement>) {
        // Only a press that started AND ended on the backdrop counts (not a drag out of a field).
        const startedOnBackdrop = pressStartedOnBackdrop.current !== false;
        pressStartedOnBackdrop.current = null;
        if (dismissOnBackdrop && startedOnBackdrop && event.target === event.currentTarget) {
          onClose();
        }
      },
    },
  };
}
