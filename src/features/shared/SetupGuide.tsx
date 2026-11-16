import { Plus, Settings, Sprout } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button, EmptyState } from '@/ui';

/** First-run guide: create an area, then products, then the first receipt (or restore a backup). */
export function SetupGuide({ title = 'Empieza por configurar tu inventario' }: { title?: string }) {
  const navigate = useNavigate();
  return (
    <EmptyState
      icon={Sprout}
      title={title}
      action={
        <div className="flex flex-wrap justify-center gap-3">
          <Button variant="tinted" icon={Settings} onClick={() => void navigate('/ajustes')}>
            Ir a Ajustes
          </Button>
          <Button
            icon={Plus}
            onClick={() => void navigate('/productos', { state: { newProduct: true } })}
          >
            Nuevo producto
          </Button>
        </div>
      }
    >
      Empieza creando un área en Ajustes, luego tus productos (Productos → Nuevo producto) y después
      registra la primera entrada.
    </EmptyState>
  );
}

/** Inside the receipt and issue sheets: there is nothing to register until a product exists. */
export function NoProductsNotice({ onCancel }: { onCancel: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      <p className="max-w-sm text-callout text-label-secondary">
        Aún no hay productos. Crea el primero para poder registrar movimientos.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button variant="tinted" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          icon={Plus}
          onClick={() =>
            void navigate('/productos', { state: { newProduct: true }, replace: true })
          }
        >
          Crear un producto
        </Button>
      </div>
    </div>
  );
}
