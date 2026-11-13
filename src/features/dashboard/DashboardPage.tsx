import { CircleCheck, Minus } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { useDashboardStats } from '@/state/selectors';
import { useInventoryStore } from '@/state/store';
import { formatCoverage, formatCurrency, formatNumber, formatQuantity, EMPTY } from '@/lib/format';
import { Button, EmptyState, List, ListRow, PageHeader, Stat } from '@/ui';
import { PageActions } from '../shared/PageActions';
import { ExpiryBadge, ReorderBadge } from '../shared/StatusBadges';

/** Home: what to buy, what expires soon and what already expired, at a glance (PLAN §8.4). */
export function DashboardPage() {
  const stats = useDashboardStats();
  const criticalDays = useInventoryStore((state) => state.data.settings.criticalDays);
  const navigate = useNavigate();

  const loss = stats.projectedLoss;
  return (
    <>
      <PageHeader title="Resumen" actions={<PageActions />} />

      <section
        aria-label="Indicadores"
        className="mb-8 grid grid-cols-1 gap-3 sheet:grid-cols-2 desktop:grid-cols-4"
      >
        <Stat
          as={Link}
          to="/vencimientos?filtro=criticos"
          label={`Por vencer ≤ ${criticalDays} días`}
          value={formatNumber(stats.expiringSoon.lots)}
          detail={`${stats.expiringSoon.lots === 1 ? 'lote' : 'lotes'} · ${formatNumber(stats.expiringSoon.units)} unidades`}
        />
        <Stat
          as={Link}
          to="/vencimientos?filtro=vencidos"
          label="Vencidos"
          value={formatNumber(stats.expired.lots)}
          detail={`${stats.expired.lots === 1 ? 'lote' : 'lotes'} · ${formatCurrency(stats.expired.value)}`}
        />
        <Stat
          as={Link}
          to="/compras"
          label="Por comprar"
          value={formatNumber(stats.toBuy.products)}
          detail={stats.toBuy.products === 1 ? 'producto' : 'productos'}
        />
        <Stat
          as={Link}
          to="/vencimientos?filtro=todos"
          label="Riesgo de pérdida"
          value={formatNumber(loss.units)}
          detail={`unidades sin usar · ${formatCurrency(loss.value)}`}
        />
      </section>

      <div className="grid grid-cols-1 gap-8 desktop:grid-cols-2">
        <List header="Usar primero">
          {stats.useFirst.length === 0 ? (
            <li>
              <EmptyState icon={CircleCheck} title="Sin lotes con saldo">
                Registra una entrada para ver aquí qué lote usar primero.
              </EmptyState>
            </li>
          ) : (
            stats.useFirst.map((item) => (
              <ListRow
                key={item.lot.id}
                title={
                  <Link to={`/productos/${item.product.id}`} className="hover:underline">
                    {item.product.name}
                  </Link>
                }
                subtitle={
                  <>
                    Lote {item.lot.lotNumber} · {formatQuantity(item.balance, item.product.unit)}
                  </>
                }
                trailing={
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <ExpiryBadge
                      status={item.status}
                      daysLeft={item.daysLeft}
                      expiryDate={item.lot.expiryDate}
                    />
                    <Button
                      size="sm"
                      variant="tinted"
                      icon={Minus}
                      aria-label={`Registrar salida de ${item.product.name}, lote ${item.lot.lotNumber}`}
                      onClick={() =>
                        void navigate(
                          `/salida?producto=${encodeURIComponent(item.product.id)}&lote=${encodeURIComponent(item.lot.id)}`,
                        )
                      }
                    >
                      Salida
                    </Button>
                  </div>
                }
              />
            ))
          )}
        </List>

        <List header="Comprar pronto">
          {stats.buySoon.length === 0 ? (
            <li>
              <EmptyState icon={CircleCheck} title="Todo en orden">
                Ningún producto necesita compra por ahora.
              </EmptyState>
            </li>
          ) : (
            stats.buySoon.map((row) => (
              <ListRow
                key={row.product.id}
                href={`/productos/${encodeURIComponent(row.product.id)}`}
                onClick={(event) => {
                  event.preventDefault();
                  void navigate(`/productos/${row.product.id}`);
                }}
                chevron
                title={row.product.name}
                subtitle={
                  <>
                    Cobertura{' '}
                    {row.effectiveCoverageMonths === null
                      ? EMPTY
                      : formatCoverage(row.effectiveCoverageMonths)}
                  </>
                }
                trailing={<ReorderBadge reorder={row.reorder} unit={row.product.unit} />}
              />
            ))
          )}
        </List>
      </div>
    </>
  );
}
