import { useId, useMemo, useState } from 'react';
import type { Product } from '@/domain/types';
import { TextField } from '@/ui';
import { normalizeText } from '@/domain/text';

interface ProductPickerProps {
  label?: string;
  products: readonly Product[];
  /** Area name by id, shown next to each suggestion. */
  areaNames: ReadonlyMap<string, string>;
  /** Selected product id, or '' */
  value: string;
  onChange: (productId: string) => void;
  error?: string;
  autoFocus?: boolean;
}

/**
 * Product search with native autocomplete (`<datalist>`): type to filter, pick a suggestion. The
 * selection is the product whose name matches what was typed.
 */
export function ProductPicker({
  label = 'Producto',
  products,
  areaNames,
  value,
  onChange,
  error,
  autoFocus,
}: ProductPickerProps) {
  const listId = useId();
  const byName = useMemo(
    () => new Map(products.map((product) => [normalizeText(product.name), product])),
    [products],
  );
  const [text, setText] = useState(() => products.find((p) => p.id === value)?.name ?? '');

  return (
    <>
      <TextField
        label={label}
        value={text}
        list={listId}
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder="Escribe para buscar"
        error={error}
        onChange={(next) => {
          setText(next);
          onChange(byName.get(normalizeText(next))?.id ?? '');
        }}
      />
      <datalist id={listId}>
        {products.map((product) => (
          <option key={product.id} value={product.name} label={areaNames.get(product.areaId)} />
        ))}
      </datalist>
    </>
  );
}
