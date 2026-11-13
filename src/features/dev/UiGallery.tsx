import {
  CircleCheck,
  CircleHelp,
  CircleX,
  Clock,
  PackageX,
  Plus,
  ShoppingCart,
  TriangleAlert,
} from 'lucide-react';
import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  DateField,
  EmptyState,
  List,
  ListRow,
  NumberField,
  PageHeader,
  SearchField,
  SegmentedControl,
  Select,
  Sheet,
  Stat,
  Table,
  TextField,
  ToastProvider,
  useToast,
  type TableSort,
} from '@/ui';

/** Temporary page (DEV only) to review every UI component in light and dark. */

interface SampleRow {
  id: string;
  name: string;
  balance: number;
  days: number;
}

const rows: SampleRow[] = [
  { id: '1', name: 'Glucosa', balance: 144, days: 9 },
  { id: '2', name: 'Colesterol', balance: 173, days: 210 },
  { id: '3', name: 'Creatinina', balance: 120, days: -4 },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-title2 font-semibold text-label">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Gallery() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [qty, setQty] = useState<number | null>(24);
  const [date, setDate] = useState('2026-11-13');
  const [area, setArea] = useState('');
  const [segment, setSegment] = useState('all');
  const [sort, setSort] = useState<TableSort>({ key: 'name', direction: 'ascending' });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const sorted = [...rows].sort((a, b) => {
    const x = sort.key === 'name' ? a.name.localeCompare(b.name, 'es') : a.balance - b.balance;
    return sort.direction === 'ascending' ? x : -x;
  });

  return (
    <>
      <PageHeader
        title="Kit de interfaz"
        actions={
          <>
            <Button icon={Plus}>Entrada</Button>
            <Button variant="tinted">Salida</Button>
          </>
        }
      />

      <Section title="Botones">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Guardar</Button>
          <Button variant="tinted">Tinted</Button>
          <Button variant="plain">Plain</Button>
          <Button variant="destructive">Dar de baja</Button>
          <Button disabled>Deshabilitado</Button>
          <Button
            loading={loading}
            onClick={() => {
              setLoading(true);
              setTimeout(() => setLoading(false), 1500);
            }}
          >
            Cargando
          </Button>
          <Button size="sm">Pequeño</Button>
          <Button size="lg">Grande</Button>
        </div>
      </Section>

      <Section title="Insignias de estado">
        <div className="flex flex-wrap gap-2">
          <Badge tone="red" icon={CircleX}>
            Vencido hace 4 días
          </Badge>
          <Badge tone="orange" icon={TriangleAlert}>
            Vence en 9 días
          </Badge>
          <Badge tone="yellow" icon={Clock}>
            Vence en 45 días
          </Badge>
          <Badge tone="green" icon={CircleCheck}>
            Vence el 12 mar 2027
          </Badge>
          <Badge tone="red" icon={ShoppingCart}>
            Comprar 3 cajas
          </Badge>
          <Badge tone="red" icon={PackageX}>
            Agotado
          </Badge>
          <Badge tone="teal" icon={PackageX}>
            Sobre el máximo
          </Badge>
          <Badge tone="gray" icon={CircleHelp}>
            Configura el consumo
          </Badge>
        </div>
      </Section>

      <Section title="Métricas y tarjetas">
        <div className="grid grid-cols-1 gap-3 sheet:grid-cols-2 desktop:grid-cols-4">
          <Stat label="Por vencer ≤ 30 días" value="13" detail="1,240 pruebas" href="#" />
          <Stat label="Vencidos" value="4" detail="$182.40" onClick={() => {}} />
          <Stat label="Por comprar" value="26" detail="productos" />
          <Stat label="Cobertura" value="—" detail="Sin consumo registrado" />
        </div>
        <Card>
          <p className="text-body text-label">Tarjeta con contenido.</p>
          <p className="text-footnote text-label-secondary">Fondo elevado, sin sombra.</p>
        </Card>
      </Section>

      <Section title="Campos">
        <SearchField label="Buscar producto" value={search} onChange={setSearch} />
        <TextField
          label="Nº de lote"
          value={name}
          onChange={setName}
          help="Se guarda en mayúsculas."
        />
        <TextField
          label="Nº de lote (error)"
          value=""
          onChange={() => {}}
          error="Ingresa el número de lote."
        />
        <NumberField label="Cantidad" value={qty} onChange={setQty} />
        <DateField label="Vencimiento" value={date} onChange={setDate} />
        <Select
          label="Procedencia"
          value={area}
          onChange={setArea}
          placeholder="Elige una procedencia"
          options={[
            { value: '1', label: '1 · GOES' },
            { value: '8', label: '8 · FOSALUD' },
          ]}
        />
      </Section>

      <Section title="Control segmentado, lista y tabla">
        <SegmentedControl
          label="Filtro de vencimiento"
          value={segment}
          onChange={setSegment}
          options={[
            { value: 'expired', label: 'Vencidos' },
            { value: '30', label: '≤ 30 días' },
            { value: '90', label: '≤ 90 días' },
            { value: 'all', label: 'Todos' },
          ]}
        />
        <List header="Usar primero">
          <ListRow
            title="Glucosa"
            subtitle="Lote LT004512 · vence en 9 días"
            trailing="12"
            chevron
            href="#"
          />
          <ListRow
            title="Colesterol"
            subtitle="Lote LT118930"
            trailing="48"
            chevron
            onClick={() => {}}
          />
          <ListRow title="Creatinina" subtitle="Sin acción" trailing="24" />
        </List>
        <Table
          caption="Productos de ejemplo"
          rows={sorted}
          getRowKey={(row) => row.id}
          sort={sort}
          onSortChange={setSort}
          onRowClick={(row) => toast.show({ message: `Abrir ${row.name}` })}
          columns={[
            { key: 'name', header: 'Producto', sortable: true, cell: (r) => r.name },
            {
              key: 'balance',
              header: 'Saldo útil',
              numeric: true,
              sortable: true,
              cell: (r) => r.balance,
            },
            {
              key: 'days',
              header: 'Vencimiento',
              cell: (r) =>
                r.days < 0 ? (
                  <Badge tone="red" icon={CircleX}>
                    Vencido hace {-r.days} días
                  </Badge>
                ) : (
                  <Badge tone="green" icon={CircleCheck}>
                    Vence en {r.days} días
                  </Badge>
                ),
            },
          ]}
        />
        <Card padding="none">
          <EmptyState
            icon={PackageX}
            title="Sin resultados"
            action={
              <Button variant="tinted" onClick={() => setSearch('')}>
                Limpiar búsqueda
              </Button>
            }
          >
            No hay productos que coincidan con la búsqueda.
          </EmptyState>
        </Card>
      </Section>

      <Section title="Hojas, alertas y avisos">
        <div className="flex flex-wrap gap-3">
          <Button variant="tinted" onClick={() => setSheetOpen(true)}>
            Abrir hoja
          </Button>
          <Button variant="destructive" onClick={() => setAlertOpen(true)}>
            Alerta destructiva
          </Button>
          <Button
            variant="plain"
            onClick={() =>
              toast.show({
                message: 'Entrada registrada · Glucosa · Lote LT123456 · 48 pruebas',
                action: { label: 'Deshacer', onAction: () => {} },
              })
            }
          >
            Mostrar aviso
          </Button>
        </div>
        <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Registrar entrada">
          <div className="flex flex-col gap-4 p-4">
            <TextField label="Nº de lote" value={name} onChange={setName} />
            <Button onClick={() => setSheetOpen(false)}>Guardar</Button>
          </div>
        </Sheet>
        <Alert
          open={alertOpen}
          destructive
          title="¿Dar de baja el lote LT004512?"
          message="Se retirarán 12 pruebas vencidas del inventario."
          confirmLabel="Dar de baja"
          onCancel={() => setAlertOpen(false)}
          onConfirm={() => setAlertOpen(false)}
        />
      </Section>
    </>
  );
}

export function UiGallery() {
  return (
    <ToastProvider>
      <Gallery />
    </ToastProvider>
  );
}
