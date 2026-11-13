import { useState } from 'react';
import { daysUntil } from '@/domain/dates';
import { productStock } from '@/domain/stock';
import { findExistingLot, validateReceipt } from '@/domain/validation';
import { formatDate, formatQuantity } from '@/lib/format';
import { useToday } from '@/state/selectors';
import { useInventoryStore } from '@/state/store';
import { Button, DateField, NumberField, Select, TextField, useToast } from '@/ui';
import { parseDecimal } from '../shared/forms';
import { ProductPicker } from '../shared/ProductPicker';

interface ReceiveFormProps {
  initialProductId?: string;
  onDone: () => void;
  onCancel: () => void;
}

type QuantityUnit = 'base' | 'package';

/** "Registrar entrada": a lot with its expiry date, source, quantity and price. */
export function ReceiveForm({ initialProductId = '', onDone, onCancel }: ReceiveFormProps) {
  const data = useInventoryStore((state) => state.data);
  const toast = useToast();
  const today = useToday();

  const [productId, setProductId] = useState(
    data.products.some((p) => p.id === initialProductId) ? initialProductId : '',
  );
  const [date, setDate] = useState(today);
  const [concept, setConcept] = useState('Compra');
  const [sourceCode, setSourceCode] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [quantity, setQuantity] = useState<number | null>(null);
  const [quantityUnit, setQuantityUnit] = useState<QuantityUnit>('base');
  const [price, setPrice] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [confirmedWarning, setConfirmedWarning] = useState(false);

  const product = data.products.find((p) => p.id === productId);
  const perPackage = product?.unitsPerPackage;
  const usesPackages = quantityUnit === 'package' && perPackage !== undefined;
  const baseQuantity = quantity === null ? null : usesPackages ? quantity * perPackage : quantity;
  const unitPrice = parseDecimal(price);

  const check = validateReceipt(
    {
      productId,
      date,
      lotNumber,
      expiryDate,
      quantity: baseQuantity,
      unitPrice: Number.isNaN(unitPrice) ? null : unitPrice,
      sourceCode: sourceCode === '' ? null : Number(sourceCode),
    },
    { today, lots: data.lots, settings: data.settings, productExists: product !== undefined },
  );
  const errors: Record<string, string> = { ...check.errors };
  if (Number.isNaN(unitPrice)) errors.unitPrice = 'Ingresa un precio válido, por ejemplo 2.50.';
  const shown = (field: string): string | undefined => (submitted ? errors[field] : undefined);
  const warning = check.warnings.expiryDate;

  // This lot expires before what is already in stock: it will be used first.
  let expiresEarlier = false;
  if (product && expiryDate && !errors.expiryDate) {
    const existing = findExistingLot(data.lots, productId, lotNumber);
    const others = productStock(data, productId, today).lots.filter(
      ({ lot, balance }) => balance > 0 && lot.expiryDate >= today && lot.id !== existing?.id,
    );
    expiresEarlier = others.length > 0 && others.some(({ lot }) => expiryDate < lot.expiryDate);
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    if (warning && !confirmedWarning) {
      setConfirmedWarning(true); // show the warning, then confirm with a second click
      return;
    }

    const result = useInventoryStore.getState().receive({
      productId,
      date,
      lotNumber,
      expiryDate,
      quantity: baseQuantity!,
      concept,
      ...(sourceCode ? { sourceCode: Number(sourceCode) } : {}),
      ...(unitPrice !== null ? { unitPrice } : {}),
    });
    if (!result.ok) {
      toast.show({ message: result.error });
      return;
    }
    onDone();
    toast.show({
      message: `Entrada registrada · ${product!.name} · Lote ${lotNumber.trim().toUpperCase()} · ${formatQuantity(baseQuantity!, product!.unit)}`,
      action: {
        label: 'Deshacer',
        onAction: () => {
          const undone = useInventoryStore.getState().undo(result.movementIds);
          toast.show({
            message: undone
              ? 'Entrada deshecha.'
              : 'No se pudo deshacer: ya hay movimientos posteriores de este lote.',
          });
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
        onChange={setProductId}
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
        <TextField
          label="Nº de lote"
          value={lotNumber}
          onChange={setLotNumber}
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
          min={date}
          error={shown('expiryDate')}
        />
        <Select
          label="Procedencia"
          value={sourceCode}
          onChange={setSourceCode}
          placeholder="Sin especificar"
          options={data.fundingSources.map((source) => ({
            value: String(source.code),
            label: `${source.code} · ${source.name}`,
          }))}
          error={shown('sourceCode')}
        />
        <TextField
          label={`Precio unitario (USD por ${product?.unit ?? 'unidad'})`}
          value={price}
          onChange={setPrice}
          inputMode="decimal"
          placeholder="0.00"
          error={shown('unitPrice')}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sheet:grid-cols-2">
        <NumberField
          label="Cantidad"
          value={quantity}
          onChange={setQuantity}
          error={shown('quantity')}
          help={
            usesPackages && baseQuantity !== null && product
              ? `= ${formatQuantity(baseQuantity, product.unit)}`
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

      {expiresEarlier ? (
        <p className="rounded-sm bg-fill px-3 py-2 text-footnote text-label-secondary">
          Este lote vence antes que los que ya tienes; se usará primero.
        </p>
      ) : null}
      {warning && confirmedWarning ? (
        <p role="alert" className="rounded-sm bg-orange/15 px-3 py-2 text-footnote text-label">
          {warning} Vence el {formatDate(expiryDate)} (en {daysUntil(expiryDate, today)} días).
          Confirma para registrarlo de todos modos.
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button type="button" variant="plain" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit">
          {warning && confirmedWarning ? 'Registrar de todos modos' : 'Registrar entrada'}
        </Button>
      </div>
    </form>
  );
}
