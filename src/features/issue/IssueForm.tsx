import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { daysUntil } from '@/domain/dates';
import { expiryStatus } from '@/domain/expiry';
import { allocateFefo, firstFefoLot } from '@/domain/fefo';
import { productStock } from '@/domain/stock';
import { isValid, validateIssue } from '@/domain/validation';
import { formatExpiry, formatQuantity } from '@/lib/format';
import { useToday } from '@/state/selectors';
import { useInventoryStore } from '@/state/store';
import { Button, DateField, NumberField, Select, TextField, useToast } from '@/ui';
import { ProductPicker } from '../shared/ProductPicker';

interface IssueFormProps {
  initialProductId?: string;
  /** Pre-selects a lot by hand (e.g. from "Usar primero"). */
  initialLotId?: string;
  onDone: () => void;
  onCancel: () => void;
}

type QuantityUnit = 'base' | 'package';

/** "Registrar salida": FEFO picks the lot; choosing another one needs a reason. */
export function IssueForm({
  initialProductId = '',
  initialLotId = '',
  onDone,
  onCancel,
}: IssueFormProps) {
  const data = useInventoryStore((state) => state.data);
  const toast = useToast();
  const today = useToday();

  const [productId, setProductId] = useState(
    data.products.some((p) => p.id === initialProductId) ? initialProductId : '',
  );
  const [date, setDate] = useState(today);
  const [concept, setConcept] = useState('Consumo');
  const [quantity, setQuantity] = useState<number | null>(null);
  const [quantityUnit, setQuantityUnit] = useState<QuantityUnit>('base');
  const [manual, setManual] = useState(initialLotId !== '');
  const [lotId, setLotId] = useState(initialLotId);
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const product = data.products.find((p) => p.id === productId);
  const perPackage = product?.unitsPerPackage;
  const usesPackages = quantityUnit === 'package' && perPackage !== undefined;
  const baseQuantity = quantity === null ? null : usesPackages ? quantity * perPackage : quantity;

  const stock = productId ? productStock(data, productId, today) : null;
  const issuable = (stock?.lots ?? []).filter(
    ({ lot, balance }) => balance > 0 && lot.expiryDate >= today,
  );
  const first = stock ? firstFefoLot(stock.lots, today) : null;
  const lotIsIssuable = issuable.some(({ lot }) => lot.id === lotId);
  const effectiveLotId = manual ? (lotIsIssuable ? lotId : (first?.lot.id ?? '')) : '';
  const selected = issuable.find(({ lot }) => lot.id === effectiveLotId);

  const check = validateIssue(
    {
      productId,
      date,
      quantity: baseQuantity,
      lotId: manual ? effectiveLotId : null,
      fefoOverrideReason: reason,
    },
    {
      today,
      productExists: product !== undefined,
      unit: product?.unit ?? 'unidad',
      usableBalance: stock?.usable ?? 0,
      firstFefoLot: first
        ? { id: first.lot.id, lotNumber: first.lot.lotNumber, expiryDate: first.lot.expiryDate }
        : null,
      ...(selected
        ? {
            selectedLot: {
              id: selected.lot.id,
              lotNumber: selected.lot.lotNumber,
              expiryDate: selected.lot.expiryDate,
              balance: selected.balance,
            },
          }
        : {}),
    },
  );
  const shown = (field: string): string | undefined =>
    submitted ? check.errors[field] : undefined;
  const isOverride =
    manual && selected !== undefined && first !== null && first.lot.id !== selected.lot.id;

  // Live preview of where the units will come from.
  const preview =
    !manual && baseQuantity !== null && baseQuantity > 0 && stock
      ? allocateFefo(stock.lots, baseQuantity, today)
      : null;

  const describeLot = (lotNumber: string, expiryDate: string): string => {
    const days = daysUntil(expiryDate, today);
    const status = expiryStatus(expiryDate, today, data.settings);
    return `${lotNumber} · ${formatExpiry(status, days, expiryDate).replace(/^V/, 'v')}`;
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!isValid(check)) return;

    const result = useInventoryStore.getState().issue({
      productId,
      date,
      quantity: baseQuantity!,
      concept,
      ...(manual ? { lotId: effectiveLotId, fefoOverrideReason: reason } : {}),
    });
    if (!result.ok) {
      toast.show({ message: result.error });
      return;
    }
    onDone();
    toast.show({
      message: `Salida registrada · ${product!.name} · ${formatQuantity(baseQuantity!, product!.unit)}`,
      action: {
        label: 'Deshacer',
        onAction: () => {
          const undone = useInventoryStore.getState().undo(result.movementIds);
          toast.show({ message: undone ? 'Salida deshecha.' : 'No se pudo deshacer la salida.' });
        },
      },
    });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4 p-4">
      <ProductPicker
        products={data.products.filter((p) => !p.archived)}
        areaNames={new Map(data.areas.map((area) => [area.id, area.name]))}
        value={productId}
        onChange={(id) => {
          setProductId(id);
          setLotId('');
          setManual(false);
        }}
        error={shown('productId')}
        autoFocus={!initialProductId}
      />

      <div className="grid grid-cols-1 gap-4 sheet:grid-cols-2">
        <DateField
          label="Fecha"
          value={date}
          onChange={setDate}
          max={today}
          error={shown('date')}
        />
        <TextField label="Concepto" value={concept} onChange={setConcept} />
        <NumberField
          label="Cantidad"
          value={quantity}
          onChange={setQuantity}
          error={shown('quantity')}
          help={
            product && stock
              ? `Disponible: ${formatQuantity(stock.usable, product.unit)} (no vencidas)`
              : undefined
          }
        />
        {perPackage !== undefined && product ? (
          <Select
            label="Unidad de la cantidad"
            value={quantityUnit}
            onChange={(value) => setQuantityUnit(value as QuantityUnit)}
            options={[
              { value: 'base', label: product.unit === 'prueba' ? 'Pruebas' : 'Unidades' },
              { value: 'package', label: `Cajas de ${perPackage}` },
            ]}
          />
        ) : null}
      </div>

      {preview?.ok ? (
        <section aria-label="Lotes de los que se descontará" className="rounded-md bg-fill p-3">
          <h3 className="mb-1 text-footnote font-semibold text-label-secondary">
            Se descontará de (primero lo que vence primero)
          </h3>
          <ul className="m-0 list-none p-0 text-callout text-label">
            {preview.allocations.map(({ lotId: id, quantity: taken }) => {
              const lot = data.lots.find((l) => l.id === id)!;
              return (
                <li key={id}>
                  {taken} de {describeLot(lot.lotNumber, lot.expiryDate)}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {product && issuable.length > 0 ? (
        manual ? (
          <div className="flex flex-col gap-3">
            <Select
              label="Lote"
              value={effectiveLotId}
              onChange={setLotId}
              options={issuable.map(({ lot, balance }) => ({
                value: lot.id,
                label: `${describeLot(lot.lotNumber, lot.expiryDate)} · ${formatQuantity(balance, product.unit)}${lot.id === first?.lot.id ? ' · sugerido (FEFO)' : ''}`,
              }))}
              error={shown('lotId')}
            />
            {isOverride && check.warnings.lotId ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-sm bg-orange/15 px-3 py-2 text-footnote text-label"
              >
                <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                {check.warnings.lotId}
              </p>
            ) : null}
            {isOverride ? (
              <TextField
                label="Motivo"
                value={reason}
                onChange={setReason}
                help="Por ejemplo: lote abierto en el equipo."
                error={shown('fefoOverrideReason')}
              />
            ) : null}
            <Button
              type="button"
              variant="plain"
              size="sm"
              onClick={() => {
                setManual(false);
                setLotId('');
                setReason('');
              }}
            >
              Volver a la sugerencia FEFO
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="plain"
            size="sm"
            onClick={() => {
              setManual(true);
              setLotId(first?.lot.id ?? '');
            }}
          >
            Elegir lote manualmente
          </Button>
        )
      ) : null}

      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button type="button" variant="plain" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit">Registrar salida</Button>
      </div>
    </form>
  );
}
