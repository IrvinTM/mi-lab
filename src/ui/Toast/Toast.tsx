import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { ToastContext, type ToastApi, type ToastOptions } from './toast-context';
import './toast.css';

const AUTO_CLOSE_MS = 5000;
// After a pause, never leave less than this, so the toast doesn't vanish the instant it's released.
const MIN_RESUME_MS = 1500;

interface ToastEntry extends ToastOptions {
  id: number;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((options: ToastOptions) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { ...options, id }]);
    return id;
  }, []);

  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext value={api}>
      {children}
      {/* Always mounted: a live region must exist before its content changes to be announced. */}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 pb-[calc(var(--space-4)+env(safe-area-inset-bottom))]"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastEntry; onDismiss: (id: number) => void }) {
  const { id, message, action } = toast;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;

  const remaining = useRef(AUTO_CLOSE_MS);
  useEffect(() => {
    if (paused) return;
    const startedAt = Date.now();
    const timer = setTimeout(() => onDismiss(id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(remaining.current - (Date.now() - startedAt), MIN_RESUME_MS);
    };
  }, [paused, id, onDismiss]);

  return (
    <div
      className="toast pointer-events-auto flex w-full max-w-md items-center gap-1 rounded-lg border border-separator bg-bg-elevated py-1 pr-1 pl-4 text-label"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        // Moving focus between the toast's own buttons keeps it paused.
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onDismiss(id);
      }}
    >
      <p className="flex-1 py-2 text-subheadline">{message}</p>
      {action && (
        <button
          type="button"
          onClick={() => {
            action.onAction();
            onDismiss(id);
          }}
          className="min-h-(--hit-target) shrink-0 rounded-md px-3 text-subheadline font-semibold text-accent hover:bg-fill"
        >
          {action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => onDismiss(id)}
        aria-label="Cerrar notificación"
        className="flex size-(--hit-target) shrink-0 items-center justify-center rounded-full text-label-secondary hover:bg-fill"
      >
        <X aria-hidden="true" size={18} />
      </button>
    </div>
  );
}
