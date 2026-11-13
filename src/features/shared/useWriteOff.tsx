import { useState, type ReactNode } from 'react';
import { formatQuantity } from '@/lib/format';
import { useInventoryStore } from '@/state/store';
import { Alert, useToast } from '@/ui';

export interface WriteOffTarget {
  lotId: string;
  lotNumber: string;
  productName: string;
  unit: string;
  /** Units that will be removed. */
  balance: number;
}

/**
 * "Dar de baja" for an expired lot: asks for confirmation (destructive alert), removes the whole
 * balance and offers "Deshacer". Render `dialog` once in the page.
 */
export function useWriteOff(): {
  requestWriteOff: (target: WriteOffTarget) => void;
  dialog: ReactNode;
} {
  const toast = useToast();
  const [target, setTarget] = useState<WriteOffTarget | null>(null);
  const [open, setOpen] = useState(false);

  const confirm = () => {
    setOpen(false);
    if (!target) return;
    const result = useInventoryStore.getState().writeOffExpired(target.lotId);
    if (!result.ok) {
      toast.show({ message: result.error });
      return;
    }
    toast.show({
      message: `Baja registrada · ${target.productName} · Lote ${target.lotNumber} · ${formatQuantity(target.balance, target.unit)}`,
      action: {
        label: 'Deshacer',
        onAction: () => {
          const undone = useInventoryStore.getState().undo(result.movementIds);
          toast.show({ message: undone ? 'Baja deshecha' : 'No se pudo deshacer la baja.' });
        },
      },
    });
  };

  return {
    requestWriteOff: (next) => {
      setTarget(next);
      setOpen(true);
    },
    dialog: (
      <Alert
        open={open}
        destructive
        title={`¿Dar de baja el lote ${target?.lotNumber ?? ''}?`}
        message={
          target
            ? `Se retirarán ${formatQuantity(target.balance, target.unit)} vencidas de ${target.productName} del inventario.`
            : undefined
        }
        confirmLabel="Dar de baja"
        onCancel={() => setOpen(false)}
        onConfirm={confirm}
      />
    ),
  };
}
