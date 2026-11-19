import { useState } from 'react';
import { todayISO } from '@/domain/dates';
import { LIMITS } from '@/domain/limits';
import type { FundingSource, Lot, LotChange, LotField } from '@/domain/types';
import { validateLotEdit } from '@/domain/validation';
import { EMPTY, formatCurrency, formatDate } from '@/lib/format';
import { useToday } from '@/state/selectors';
import { useInventoryStore } from '@/state/store';
import { Button, DateField, List, ListRow, Select, TextField, useToast } from '@/ui';
import { FormError } from '../shared/FormError';
import { parseDecimal, useFocusFirstInvalid } from '../shared/forms';
import { sourceName } from './sourceName';

export interface EditLotTarget {
  lot: Lot;
  productName: string;
  unit: string;
}

const FIELD_LABELS: Record<LotField, string> = {
  lotNumber: 'N.º de lote',
  expiryDate: 'Vencimiento',
  unitPrice: 'Precio unitario',
  sourceCode: 'Procedencia',
};

function changeValue(
  field: LotField,
  value: string | undefined,
  sources: readonly FundingSource[],
): string {
  if (value === undefined) return EMPTY;
  switch (field) {
    case 'expiryDate':
      return formatDate(value);
    case 'unitPrice':
      return formatCurrency(Number(value));
    case 'sourceCode':
      return sourceName(sources, Number(value));
    default:
      return value;
  }
}

/** The corrections of one lot, newest first. */
function LotHistory({
  changes,
  sources,
}: {
  changes: readonly LotChange[];
  sources: readonly FundingSource[];
}) {
  if (changes.length === 0) return null;
  return (
    <List header="Correcciones anteriores">
      {[...changes].reverse().map((change) => (
        <ListRow
          key={change.id}
          title={`${FIELD_LABELS[change.field]}: ${changeValue(change.field, change.from, sources)} → ${changeValue(change.field, change.to, sources)}`}
          subtitle={`${formatDate(todayISO(new Date(change.createdAt)))} · ${change.reason}`}
        />
      ))}
    </List>
  );
}

const priceText = (price: number | undefined): string => (price === undefined ? '' : String(price));

/**
 * "Editar lote": corrects the lot number, expiry date, price and source of a received lot, with a
 * mandatory reason. Every change is kept in the lot's history; quantities are corrected with
 * "Ajustar" instead.
 */
export function EditLotForm({ target, onClose }: { target: EditLotTarget; onClose: () => void }) {
  const { lot } = target;
  const data = useInventoryStore((state) => state.data);
  const toast = useToast();
  const today = useToday();
  const [lotNumber, setLotNumber] = useState(lot.lotNumber);
  const [expiryDate, setExpiryDate] = useState(lot.expiryDate);
  const [price, setPrice] = useState(priceText(lot.unitPrice));
  const [sourceCode, setSourceCode] = useState(
    lot.sourceCode === undefined ? '' : String(lot.sourceCode),
  );
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [confirmedWarning, setConfirmedWarning] = useState(false);
  const { ref: formRef, focusFirstInvalid } = useFocusFirstInvalid();

  const unitPrice = parseDecimal(price);
  const input = {
    lotNumber,
    expiryDate,
    unitPrice: Number.isNaN(unitPrice) ? null : unitPrice,
    sourceCode: sourceCode === '' ? null : Number(sourceCode),
    reason,
  };
  const check = validateLotEdit(input, {
    lot,
    lots: data.lots,
    fundingSources: data.fundingSources,
    today,
  });
  const errors: Record<string, string> = { ...check.errors };
  if (Number.isNaN(unitPrice)) errors.unitPrice = 'Ingresa un precio válido, por ejemplo 2.50.';
  const shown = (field: string): string | undefined => (submitted ? errors[field] : undefined);
  const warning = check.warnings.expiryDate;
  const history = (data.lotChanges ?? []).filter((change) => change.lotId === lot.id);
  // A source that was removed from the catalog still shows as the lot's current value.
  const sourceOptions = data.fundingSources.some((source) => source.code === lot.sourceCode)
    ? data.fundingSources
    : lot.sourceCode === undefined
      ? data.fundingSources
      : [...data.fundingSources, { code: lot.sourceCode, name: sourceName([], lot.sourceCode) }];

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) {
      focusFirstInvalid();
      return;
    }
    if (warning && !confirmedWarning) {
      setConfirmedWarning(true); // show the warning, then confirm with a second click
      return;
    }
    const result = useInventoryStore.getState().editLot(lot.id, input);
    if (!result.ok) {
      focusFirstInvalid();
      return;
    }
    onClose();
    toast.show({
      message: `Lote corregido · ${target.productName} · Lote ${lotNumber.trim().toUpperCase()}`,
    });
  };

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
      <p className="text-callout text-label-secondary">
        {target.productName} · Entrada del {formatDate(lot.receivedDate)}
      </p>
      <div className="grid grid-cols-1 gap-4 sheet:grid-cols-2">
        <TextField
          label="N.º de lote"
          value={lotNumber}
          onChange={setLotNumber}
          maxLength={LIMITS.shortText}
          autoCapitalize="characters"
          autoComplete="off"
          error={shown('lotNumber')}
        />
        <DateField
          label="Vencimiento"
          value={expiryDate}
          onChange={(value) => {
            setExpiryDate(value);
            setConfirmedWarning(false);
          }}
          error={shown('expiryDate')}
        />
        <Select
          label="Procedencia"
          value={sourceCode}
          onChange={setSourceCode}
          placeholder="Sin especificar"
          options={sourceOptions.map((source) => ({
            value: String(source.code),
            label: `${source.code} · ${source.name}`,
          }))}
          error={shown('sourceCode')}
        />
        <TextField
          label={`Precio unitario (USD por ${target.unit})`}
          value={price}
          onChange={setPrice}
          maxLength={LIMITS.shortText}
          inputMode="decimal"
          placeholder="0.00"
          help="Se aplica a todas las entradas y salidas de este lote."
          error={shown('unitPrice')}
        />
      </div>
      <TextField
        label="Motivo de la corrección"
        value={reason}
        onChange={setReason}
        maxLength={LIMITS.longText}
        help="Por ejemplo: error de digitación, según factura."
        error={shown('reason')}
      />

      {warning && confirmedWarning ? (
        <p role="alert" className="rounded-sm bg-orange/15 px-3 py-2 text-footnote text-label">
          {warning} Confirma para guardar de todos modos.
        </p>
      ) : null}
      <FormError message={submitted ? errors.form : undefined} />
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button type="button" variant="plain" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit">
          {warning && confirmedWarning ? 'Guardar de todos modos' : 'Guardar cambios'}
        </Button>
      </div>

      <LotHistory changes={history} sources={data.fundingSources} />
    </form>
  );
}
