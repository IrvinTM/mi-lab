import { useId, useRef } from 'react';
import { useModalDialog } from '../internal/useModalDialog';
import './alert.css';

export interface AlertProps {
  open: boolean;
  title: string;
  message?: string;
  /** Verb that names the result ("Dar de baja"), never "OK". */
  confirmLabel: string;
  cancelLabel?: string;
  /** Paints the confirm button red and puts the initial focus on Cancel. */
  destructive?: boolean;
  onConfirm: () => void;
  /** Cancel button and Esc. The backdrop does not dismiss an alert. */
  onCancel: () => void;
}

const buttonClass =
  'min-h-(--hit-target) px-4 text-body hover:bg-fill focus-visible:-outline-offset-3';

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
        <div className="grid grid-cols-2 border-t border-separator">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className={`${buttonClass} border-r border-separator text-accent`}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={`${buttonClass} ${destructive ? 'font-bold text-red' : 'font-semibold text-accent'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
