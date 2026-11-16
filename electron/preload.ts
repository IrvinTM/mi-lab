// Sandboxed preload: it can only `require` 'electron' (no local files), so the channel names are
// repeated from api.ts. Main validates every argument again and checks the sender is the app.
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('miLabDesktop', {
  /** Saves today's automatic backup (`text` = the serialized JSON) or, with `null`, only reports the last one. */
  backup: (text: string | null): Promise<unknown> => ipcRenderer.invoke('mi-lab:backup', text),
  /** The inventory database (SQLite in the main process). */
  db: {
    /** The stored inventory as JSON text (`null` when empty). */
    load: (): Promise<unknown> => ipcRenderer.invoke('mi-lab:db-load'),
    /** Replaces the stored inventory with `json` (the serialized InventoryData). */
    save: (json: string): Promise<unknown> => ipcRenderer.invoke('mi-lab:db-save', json),
    clear: (): Promise<unknown> => ipcRenderer.invoke('mi-lab:db-clear'),
    /**
     * Registers what to run when the window is about to close (write pending changes). Main waits
     * for it (with a time limit) before closing. Only the last handler registered is kept.
     */
    onFlushRequest: (handler: () => Promise<void>): void => {
      ipcRenderer.removeAllListeners('mi-lab:flush-request');
      ipcRenderer.on('mi-lab:flush-request', () => {
        Promise.resolve()
          .then(handler)
          .catch(() => undefined)
          .finally(() => ipcRenderer.send('mi-lab:flush-done'));
      });
    },
  },
});
