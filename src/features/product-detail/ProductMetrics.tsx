import { pluralEs } from '@/domain/plural';
import {
  formatCoverage,
  formatNumber,
  formatPackageCount,
  formatQuantity,
  formatStock,
  EMPTY,
} from '@/lib/format';
import type { ProductRow } from '@/state/derive';
import { Stat } from '@/ui';
import { ReorderBadge } from '../shared/StatusBadges';

const NO_CONSUMPTION = 'Sin consumo registrado';

function consumptionDetail(consumption: ProductRow['consumption']): string {
  if (!consumption) return NO_CONSUMPTION;
  return consumption.source === 'calculated' && consumption.months !== undefined
    ? `al mes · calculado (${formatCoverage(consumption.months)})`
    : 'al mes · manual';
}

function optionalNumber(value: number | undefined): string {
  return value === undefined ? EMPTY : formatNumber(value);
}

/** The six figures that answer "how much do we have, how long does it last, what to buy". */
export function ProductMetrics({ row }: { row: ProductRow }) {
  const { product, reorder, consumption } = row;
  const hasLimits = reorder.min !== undefined || reorder.max !== undefined;
  const suggestedBoxes = reorder.suggestedPackages;

  return (
    <section
      aria-label="Métricas"
      className="grid grid-cols-1 gap-3 sheet:grid-cols-2 desktop:grid-cols-3"
    >
      <Stat
        label="Saldo útil"
        value={formatStock(row.usable, product)}
        detail={`No vencido · ${formatQuantity(row.usable, product.unit)}`}
      />
      <Stat
        label="Vencido"
        value={formatStock(row.expired, product)}
        detail={row.expired > 0 ? 'No se puede usar' : 'Sin lotes vencidos con saldo'}
      />
      <Stat
        label="Consumo promedio"
        value={consumption ? formatQuantity(consumption.value, product.unit) : EMPTY}
        detail={consumptionDetail(consumption)}
      />
      <Stat
        label="Cobertura efectiva"
        value={formatCoverage(row.effectiveCoverageMonths)}
        detail={
          row.effectiveCoverageMonths === null
            ? NO_CONSUMPTION
            : `Sin contar vencimientos: ${formatCoverage(row.coverageMonths)}`
        }
      />
      <Stat
        label="Mínimo / máximo"
        value={
          hasLimits ? `${optionalNumber(reorder.min)} / ${optionalNumber(reorder.max)}` : EMPTY
        }
        detail={
          hasLimits ? `${pluralEs(product.unit, 2)} (mín / máx)` : 'Define un consumo o límites'
        }
      />
      <Stat
        label="Compra sugerida"
        value={
          reorder.suggestedQty === undefined
            ? EMPTY
            : formatQuantity(reorder.suggestedQty, product.unit)
        }
        detail={
          <span className="flex flex-wrap items-center gap-2">
            <ReorderBadge reorder={reorder} unit={product.unit} />
            {suggestedBoxes ? <span>{formatPackageCount(suggestedBoxes)}</span> : null}
          </span>
        }
      />
    </section>
  );
}
