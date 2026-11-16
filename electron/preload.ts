// Sandboxed preload: it can only `require` 'electron' (no local files), so the channel name is
// repeated from api.ts. The whole surface is ONE function; main validates its argument again.
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('miLabDesktop', {
  /** Saves today's automatic backup (`text` = the serialized JSON) or, with `null`, only reports the last one. */
  backup: (text: string | null): Promise<unknown> => ipcRenderer.invoke('mi-lab:backup', text),
});
