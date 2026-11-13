import { useState, type ReactNode } from 'react';
import { Sheet } from '@/ui';
import { AdjustForm } from './AdjustForm';

export interface AdjustTarget {
  lotId: string;
  lotNumber: string;
  productName: string;
  unit: string;
  /** Current balance of the lot. */
  balance: number;
}

/** "Ajustar saldo" of a lot (inventory correction with a mandatory reason). Render `dialog` once. */
export function useAdjust(): { requestAdjust: (target: AdjustTarget) => void; dialog: ReactNode } {
  const [target, setTarget] = useState<AdjustTarget | null>(null);
  const [open, setOpen] = useState(false);
  return {
    requestAdjust: (next) => {
      setTarget(next);
      setOpen(true);
    },
    dialog: (
      <Sheet open={open} onClose={() => setOpen(false)} title="Ajustar saldo del lote">
        {target ? <AdjustForm target={target} onClose={() => setOpen(false)} /> : null}
      </Sheet>
    ),
  };
}
