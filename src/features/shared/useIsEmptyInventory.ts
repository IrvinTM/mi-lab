import { useInventoryStore } from '@/state/store';

/** True while there are no products: a freshly installed app, before anything was set up. */
export function useIsEmptyInventory(): boolean {
  return useInventoryStore((state) => state.data.products.length === 0);
}
