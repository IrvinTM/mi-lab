import type { DesktopDatabaseBridge } from '@/data/desktopRepository';
import type { useInventoryStore } from './store';

/**
 * Desktop only: when the window is about to close, main asks the page to write the changes still
 * waiting for the save debounce, and closes once this resolves (or after a time limit).
 */
export function startFlushOnClose(
  store: typeof useInventoryStore,
  bridge: DesktopDatabaseBridge | undefined = window.miLabDesktop?.db,
): void {
  bridge?.onFlushRequest(() => store.getState().flush());
}
