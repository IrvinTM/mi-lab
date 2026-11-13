import { ChevronLeft, PackageSearch, Pencil } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useProductRows, useToday } from '@/state/selectors';
import { useInventoryStore } from '@/state/store';
import { Button, EmptyState, PageHeader } from '@/ui';
import { EditProductSheet } from '../shared/EditProductSheet';
import { PageActions } from '../shared/PageActions';
import { LedgerSection } from './LedgerSection';
import { LotsSection } from './LotsSection';
import { ProductMetrics } from './ProductMetrics';

const BACK_LINK =
  'inline-flex min-h-(--hit-target) items-center gap-1 text-body text-accent no-underline hover:opacity-80';

export function ProductDetailPage() {
  const { id = '' } = useParams();
  const rows = useProductRows();
  const today = useToday();
  const fundingSources = useInventoryStore((state) => state.data.fundingSources);
  const settings = useInventoryStore((state) => state.data.settings);
  const row = rows.find((candidate) => candidate.product.id === id);
  const [editing, setEditing] = useState(false);

  if (!row) {
    return (
      <EmptyState
        icon={PackageSearch}
        title="Producto no encontrado"
        action={
          <Link to="/productos" className={BACK_LINK}>
            Ir a Productos
          </Link>
        }
      >
        Es posible que se haya eliminado o que el enlace sea incorrecto.
      </EmptyState>
    );
  }

  const { product } = row;
  const identifiers = [
    row.areaName,
    product.code ? `Código ${product.code}` : null,
    product.cardNumber ? `Tarjeta ${product.cardNumber}` : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link to="/productos" className={BACK_LINK}>
          <ChevronLeft aria-hidden="true" size={18} />
          Productos
        </Link>
        <PageHeader
          title={product.name}
          actions={
            <>
              <PageActions productId={product.id} />
              <Button variant="plain" icon={Pencil} onClick={() => setEditing(true)}>
                Editar
              </Button>
            </>
          }
        />
        <p className="-mt-4 text-callout text-label-secondary">{identifiers.join(' · ')}</p>
      </div>
      <ProductMetrics row={row} />
      <LotsSection row={row} today={today} settings={settings} fundingSources={fundingSources} />
      <LedgerSection productId={product.id} fundingSources={fundingSources} />
      <EditProductSheet product={product} open={editing} onClose={() => setEditing(false)} />
    </div>
  );
}
