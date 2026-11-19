import { useState, type ReactNode } from 'react';
import { Sheet } from '@/ui';
import { EditLotForm, type EditLotTarget } from './EditLotForm';

/** "Editar lote" (lot number, expiry, price and source, with history). Render `dialog` once. */
export function useEditLot(): {
  requestEdit: (target: EditLotTarget) => void;
  dialog: ReactNode;
} {
  const [target, setTarget] = useState<EditLotTarget | null>(null);
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(0);
  return {
    requestEdit: (next) => {
      setTarget(next);
      setOpened((count) => count + 1);
      setOpen(true);
    },
    dialog: (
      <Sheet open={open} onClose={() => setOpen(false)} title="Editar lote">
        {/* key: every opening starts from the lot's current values. */}
        {target ? (
          <EditLotForm key={opened} target={target} onClose={() => setOpen(false)} />
        ) : null}
      </Sheet>
    ),
  };
}
