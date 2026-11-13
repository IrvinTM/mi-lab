import { useState } from 'react';
import { formatQuantity } from '@/lib/format';
import { useInventoryStore } from '@/state/store';
import { Button, NumberField, Select, TextField, useToast } from '@/ui';
import { useFocusFirstInvalid } from './forms';
import type { AdjustTarget } from './useAdjust';

type Direction = 'increase' | 'decrease';

export function AdjustForm({ target, onClose }: { target: AdjustTarget; onClose: () => void }) {
  const toast = useToast();
  const [direction, setDirection] = useState<Direction>('decrease');
  const [quantity, setQuantity] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { ref: formRef, focusFirstInvalid } = useFocusFirstInvalid();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const delta = (quantity ?? 0) * (direction === 'increase' ? 1 : -1);
    const result = useInventoryStore.getState().adjust(target.lotId, delta, reason);
    if (!result.ok) {
      setErrors(result.errors);
      focusFirstInvalid();
      return;
    }
    onClose();
    toast.show({
      message: `Ajuste registrado · ${target.productName} · Lote ${target.lotNumber} · ${direction === 'increase' ? '+' : '−'}${formatQuantity(quantity ?? 0, target.unit)}`,
      action: {
        label: 'Deshacer',
        onAction: () => {
          const undone = useInventoryStore.getState().undo(result.movementIds);
          toast.show({ message: undone ? 'Ajuste deshecho' : 'No se pudo deshacer el ajuste.' });
        },
      },
    });
  };

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
      <p className="text-callout text-label-secondary">
        {target.productName} · Lote {target.lotNumber} · Saldo actual:{' '}
        {formatQuantity(target.balance, target.unit)}
      </p>
      <Select
        label="Tipo de ajuste"
        value={direction}
        onChange={(value) => setDirection(value as Direction)}
        options={[
          { value: 'decrease', label: 'Disminuir (faltante, merma)' },
          { value: 'increase', label: 'Aumentar (sobrante, conteo)' },
        ]}
      />
      <NumberField
        label="Cantidad"
        value={quantity}
        onChange={setQuantity}
        error={errors.quantity}
        autoFocus
      />
      <TextField
        label="Motivo"
        value={reason}
        onChange={setReason}
        help="Por ejemplo: conteo físico, frasco dañado."
        error={errors.reason}
      />
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button type="button" variant="plain" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit">Registrar ajuste</Button>
      </div>
    </form>
  );
}
