import { useState } from 'react';
import type { Area, Product } from '@/domain/types';
import { useInventoryStore } from '@/state/store';
import { Button, NumberField, Select, Sheet, TextField, useToast } from '@/ui';
import { useFocusFirstInvalid } from './forms';

const BASE_UNITS = ['prueba', 'unidad', 'frasco', 'caja', 'bolsa'];
const OTHER_UNIT = '__other__';

interface EditFormProps {
  /** The product being edited; `undefined` creates a new one. */
  product?: Product;
  areas: readonly Area[];
  onClose: () => void;
}

/** Sets an optional field, or removes it when the input was left empty. */
function withOptional<K extends keyof Product>(product: Product, key: K, value: Product[K] | null) {
  const next = { ...product };
  if (value === null || value === undefined || value === '') delete next[key];
  else next[key] = value;
  return next;
}

function EditForm({ product, areas, onClose }: EditFormProps) {
  const toast = useToast();
  const [name, setName] = useState(product?.name ?? '');
  const [areaId, setAreaId] = useState(product?.areaId ?? areas[0]?.id ?? '');
  const [packaging, setPackaging] = useState(product?.packaging ?? '');
  const [unit, setUnit] = useState(product?.unit ?? BASE_UNITS[0] ?? 'prueba');
  const [customUnit, setCustomUnit] = useState('');
  const [unitsPerPackage, setUnitsPerPackage] = useState<number | null>(
    product?.unitsPerPackage ?? null,
  );
  const [minStock, setMinStock] = useState<number | null>(product?.minStock ?? null);
  const [maxStock, setMaxStock] = useState<number | null>(product?.maxStock ?? null);
  const [avg, setAvg] = useState<number | null>(product?.avgMonthlyConsumption ?? null);
  const [code, setCode] = useState(product?.code ?? '');
  const [cardNumber, setCardNumber] = useState(product?.cardNumber ?? '');
  const [submitted, setSubmitted] = useState(false);
  /** Errors the store reported (e.g. a duplicate name), shown until the field changes. */
  const [storeErrors, setStoreErrors] = useState<Record<string, string>>({});
  const { ref: formRef, focusFirstInvalid } = useFocusFirstInvalid();

  const errors: Record<string, string> = {};
  if (!name.trim()) errors.name = 'Ingresa el nombre del producto.';
  if (unitsPerPackage !== null && unitsPerPackage < 1) {
    errors.unitsPerPackage = 'Debe ser al menos 1.';
  }
  if (minStock !== null && maxStock !== null && maxStock < minStock) {
    errors.maxStock = 'El máximo no puede ser menor que el mínimo.';
  }
  const otherUnit = unit === OTHER_UNIT;
  if (otherUnit && !customUnit.trim()) errors.unit = 'Escribe la unidad base.';
  if (!areaId) errors.areaId = 'Elige un área.';
  const shown = (field: string) => (submitted ? errors[field] : undefined) ?? storeErrors[field];

  const units = BASE_UNITS.includes(unit) || otherUnit ? BASE_UNITS : [...BASE_UNITS, unit];

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) {
      focusFirstInvalid();
      return;
    }

    let next = {
      ...product,
      name: name.trim(),
      areaId,
      unit: otherUnit ? customUnit.trim() : unit,
    } as Product;
    next = withOptional(next, 'packaging', packaging.trim());
    next = withOptional(next, 'unitsPerPackage', unitsPerPackage);
    next = withOptional(next, 'minStock', minStock);
    next = withOptional(next, 'maxStock', maxStock);
    next = withOptional(next, 'avgMonthlyConsumption', avg);
    next = withOptional(next, 'code', code.trim());
    next = withOptional(next, 'cardNumber', cardNumber.trim());
    if (product) {
      useInventoryStore.getState().upsertProduct(next);
    } else {
      const draft: Partial<Product> = { ...next };
      delete draft.id;
      const result = useInventoryStore.getState().addProduct(draft as Omit<Product, 'id'>);
      if (!result.ok) {
        setStoreErrors(result.errors);
        focusFirstInvalid();
        return;
      }
    }
    onClose();
    toast.show({
      message: `${product ? 'Producto actualizado' : 'Producto creado'} · ${next.name}`,
    });
  };

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
      <TextField
        label="Nombre"
        value={name}
        onChange={(value) => {
          setName(value);
          setStoreErrors({});
        }}
        error={shown('name')}
        autoFocus
      />
      <div className="grid grid-cols-1 gap-4 sheet:grid-cols-2">
        <Select
          label="Área"
          value={areaId}
          onChange={(value) => {
            setAreaId(value);
            setStoreErrors({});
          }}
          error={shown('areaId')}
          options={areas.map((area) => ({ value: area.id, label: area.name }))}
        />
        <Select
          label="Unidad base"
          value={unit}
          onChange={setUnit}
          options={[
            ...units.map((value) => ({ value, label: value })),
            { value: OTHER_UNIT, label: 'Otra…' },
          ]}
          help="En qué se cuenta el saldo."
        />
        {otherUnit ? (
          <TextField
            label="Otra unidad base"
            value={customUnit}
            onChange={setCustomUnit}
            error={shown('unit')}
            help="Por ejemplo: vial, kit, litro."
          />
        ) : null}
        <TextField
          label="Presentación"
          value={packaging}
          onChange={setPackaging}
          help="Caja, vial, set, frasco…"
        />
        <NumberField
          label="Unidades por presentación"
          value={unitsPerPackage}
          onChange={setUnitsPerPackage}
          error={shown('unitsPerPackage')}
          help="Por ejemplo 24 pruebas por caja."
        />
        <NumberField label="Existencia mínima" value={minStock} onChange={setMinStock} />
        <NumberField
          label="Existencia máxima"
          value={maxStock}
          onChange={setMaxStock}
          error={shown('maxStock')}
        />
      </div>
      <NumberField
        label="Consumo promedio mensual (manual)"
        value={avg}
        onChange={setAvg}
        help="Se usa mientras no haya un mes de salidas registradas; después se calcula solo. Si dejas vacíos el mínimo y el máximo, se estiman a partir de este valor."
      />
      <div className="grid grid-cols-1 gap-4 sheet:grid-cols-2">
        <TextField label="Código" value={code} onChange={setCode} />
        <TextField label="N.º de tarjeta" value={cardNumber} onChange={setCardNumber} />
      </div>
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button type="button" variant="plain" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit">{product ? 'Guardar cambios' : 'Crear producto'}</Button>
      </div>
    </form>
  );
}

interface EditProductSheetProps {
  /** Omit to create a new product. */
  product?: Product;
  open: boolean;
  onClose: () => void;
}

/** "Editar producto" (or "Nuevo producto" without `product`): name, area, unit, minimum, maximum, manual consumption, package size and identifiers. */
export function EditProductSheet({ product, open, onClose }: EditProductSheetProps) {
  const areas = useInventoryStore((state) => state.data.areas);
  return (
    <Sheet open={open} onClose={onClose} title={product ? 'Editar producto' : 'Nuevo producto'}>
      <EditForm product={product} areas={areas} onClose={onClose} />
    </Sheet>
  );
}
