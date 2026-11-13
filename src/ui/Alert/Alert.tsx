import { useId, useRef } from 'react';
import { Button } from '../Button';
import { useModalDialog } from '../internal/useModalDialog';
import './alert.css';

export interface AlertProps {
  open: boolean;
  title: string;
  message?: string;
  /** Verb that names the result ("Dar de baja"), never "OK". */
  confirmLabel: string;
  cancelLabel?: string;
  /** Red confirm label; the initial focus goes to Cancel (both buttons keep the same weight). */
  destructive?: boolean;
  onConfirm: () => void;
  /** Cancel button and Esc. The backdrop does not dismiss an alert. */
  onCancel: () => void;
}

/**
 * Confirmation alert (`role="alertdialog"`). For a destructive alert the initial focus lands on
 * Cancel, so a stray Enter or Space never confirms the action.
 */
export function Alert({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancelar',
  destructive = false,
  onConfirm,
  onCancel,
}: AlertProps) {
  const titleId = useId();
  const messageId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const { ref, dialogProps } = useModalDialog({
    open,
    onClose: onCancel,
    initialFocus: destructive ? cancelRef : confirmRef,
  });

  return (
    <dialog
      ref={ref}
      role="alertdialog"
      className="alert"
      aria-labelledby={titleId}
      aria-describedby={message ? messageId : undefined}
      {...dialogProps}
    >
      <div className="alert-panel">
        <div className="px-4 pt-5 pb-4 text-center">
          <h2 id={titleId} className="text-headline font-semibold text-label">
            {title}
          </h2>
          {message && (
            <p id={messageId} className="mt-1 text-footnote text-label-secondary">
              {message}
            </p>
          )}
        </div>
        {/* Cancel leads and the action trails. A destructive action is never the prominent one. */}
        <div className="grid grid-cols-2 gap-2 px-4 pb-4">
          <Button ref={cancelRef} variant="plain" fullWidth onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={destructive ? 'destructive-plain' : 'filled'}
            fullWidth
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
