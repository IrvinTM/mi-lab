import { createContext, useContext } from 'react';

export interface ToastOptions {
  message: string;
  /** Optional single action, e.g. "Deshacer". Dismisses the toast after running. */
  action?: { label: string; onAction: () => void };
}

export interface ToastApi {
  /** Shows a toast and returns its id. */
  show: (options: ToastOptions) => number;
  dismiss: (id: number) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}
