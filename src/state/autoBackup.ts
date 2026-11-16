import { create } from 'zustand';
import type { DesktopDatabaseBridge } from '@/data/desktopRepository';
import { serializeBackup } from './backup';
import type { useInventoryStore } from './store';

/** Where the desktop app keeps its automatic copies (mirrors electron/api.ts; the page never imports from there). */
export interface AutoBackupStatus {
  dir: string;
  lastFile?: string;
  /** ISO 8601. */
  lastSavedAt?: string;
  /** The inventory database file (`mi-lab.db`). */
  database?: string;
}

type BridgeResponse = { ok: true; status: AutoBackupStatus } | { ok: false; error: string };

/** Exposed by the Electron preload as `window.miLabDesktop`; absent in the browser. */
export interface DesktopBridge {
  /** Saves today's automatic backup, or only reports the last one when `text` is `null`. */
  backup(text: string | null): Promise<BridgeResponse>;
  /** The inventory database (absent in versions before T9.4). */
  db?: DesktopDatabaseBridge;
}

declare global {
  interface Window {
    miLabDesktop?: DesktopBridge;
  }
}

export const isDesktop = (): boolean => typeof window !== 'undefined' && !!window.miLabDesktop;

interface AutoBackupState {
  status?: AutoBackupStatus;
  /** The last automatic copy failed (Spanish, user-facing). */
  error?: string;
}

export const useAutoBackupStatus = create<AutoBackupState>()(() => ({}));

type InventoryStore = typeof useInventoryStore;

/**
 * Desktop only: after every change to the inventory (and once when it loads) sends the serialized
 * backup to the main process, which keeps one copy per day. Returns a function that stops it.
 */
export function startAutoBackup(
  store: InventoryStore,
  bridge: DesktopBridge | undefined = window.miLabDesktop,
  debounceMs = 10_000,
): () => void {
  if (!bridge) return () => undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const apply = (response: BridgeResponse) => {
    useAutoBackupStatus.setState(
      response.ok ? { status: response.status, error: undefined } : { error: response.error },
    );
  };
  const call = (text: string | null) =>
    bridge
      .backup(text)
      .then(apply, () =>
        useAutoBackupStatus.setState({ error: 'No se pudo guardar el respaldo automático.' }),
      );

  const save = () => {
    timer = undefined;
    const { status, data } = store.getState();
    if (status === 'ready') void call(serializeBackup(data));
  };
  const schedule = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(save, debounceMs);
  };

  void call(null);
  if (store.getState().status === 'ready') schedule();
  const unsubscribe = store.subscribe((state, previous) => {
    const justLoaded = state.status === 'ready' && previous.status !== 'ready';
    if (state.status === 'ready' && (justLoaded || state.data !== previous.data)) schedule();
  });
  return () => {
    unsubscribe();
    if (timer !== undefined) clearTimeout(timer);
  };
}
