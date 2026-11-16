import { useMemo, useState } from 'react';
import { CircleAlert, FileSpreadsheet } from 'lucide-react';
import { currentMonthRange, isValidISODate, monthRange, previousMonthRange } from '@/domain/dates';
import { buildReport, type ReportData, type TypeTotals } from '@/domain/report';
import type { ISODate } from '@/domain/types';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { useToday } from '@/state/selectors';
import { useInventoryStore } from '@/state/store';
import {
  Button,
  Card,
  DateField,
  EmptyState,
  PageHeader,
  SegmentedControl,
  Stat,
  TextField,
  useToast,
} from '@/ui';
import { downloadBytes } from '../shared/download';
import { SetupGuide } from '../shared/SetupGuide';
import { useIsEmptyInventory } from '../shared/useIsEmptyInventory';

type Mode = 'current' | 'previous' | 'month' | 'range';

const MODES = [
  { value: 'current', label: 'Este mes' },
  { value: 'previous', label: 'Mes anterior' },
  { value: 'month', label: 'Elegir mes' },
  { value: 'range', label: 'Rango' },
] as const;

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

interface Resolved {
  range?: { from: ISODate; to: ISODate };
  error?: string;
}

/** Turns the controls into a range, or a Spanish message. The period never includes the future. */
function resolvePeriod(
  mode: Mode,
  today: ISODate,
  month: string,
  from: string,
  to: string,
): Resolved {
  if (mode === 'current') return { range: currentMonthRange(today) };
  if (mode === 'previous') return { range: previousMonthRange(today) };
  if (mode === 'month') {
    if (!/^\d{4}-\d{2}$/.test(month)) return { error: 'Elige un mes.' };
    const full = monthRange(month);
    if (full.from > today) return { error: 'Elige un mes que ya haya empezado.' };
    return { range: { from: full.from, to: full.to < today ? full.to : today } };
  }
  if (!isValidISODate(from)) return { error: 'Indica la fecha “Desde”.' };
  if (!isValidISODate(to)) return { error: 'Indica la fecha “Hasta”.' };
  if (from > to) return { error: 'La fecha “Desde” no puede ser posterior a “Hasta”.' };
  if (to > today) return { error: 'La fecha “Hasta” no puede ser posterior a hoy.' };
  return { range: { from, to } };
}

function totalsDetail(totals: TypeTotals): string {
  return `${formatNumber(totals.units)} unidades · ${formatCurrency(totals.value)}`;
}

function Summary({ report }: { report: ReportData }) {
  const { summary, period } = report;
  return (
    <section aria-labelledby="report-preview" className="flex flex-col gap-4">
      <div>
        <h2 id="report-preview" className="text-title3 font-semibold text-label">
          Vista previa
        </h2>
        <p className="text-subheadline text-label-secondary">
          Del {formatDate(period.from)} al {formatDate(period.cutoff)}
        </p>
      </div>
      {summary.movements === 0 ? (
        <EmptyState icon={FileSpreadsheet} title="Sin movimientos en este periodo">
          Puedes descargar el informe igualmente: incluirá las existencias y los lotes a la fecha de
          corte.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 sheet:grid-cols-2 desktop:grid-cols-3">
          <Stat label="Movimientos" value={formatNumber(summary.movements)} />
          <Stat
            label="Entradas"
            value={formatNumber(summary.receipt.count)}
            detail={totalsDetail(summary.receipt)}
          />
          <Stat
            label="Salidas"
            value={formatNumber(summary.issue.count)}
            detail={totalsDetail(summary.issue)}
          />
          <Stat
            label="Ajustes"
            value={formatNumber(summary.adjustment.count)}
            detail={totalsDetail(summary.adjustment)}
          />
          <Stat
            label="Bajas por vencimiento"
            value={formatNumber(summary.expiry_writeoff.count)}
            detail={totalsDetail(summary.expiry_writeoff)}
          />
        </div>
      )}
    </section>
  );
}

export function ReportsPage() {
  const today = useToday();
  const data = useInventoryStore((state) => state.data);
  const toast = useToast();
  const noProducts = useIsEmptyInventory();
  const [mode, setMode] = useState<Mode>('current');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [from, setFrom] = useState(currentMonthRange(today).from);
  const [to, setTo] = useState(today);
  const [generating, setGenerating] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const { range, error } = resolvePeriod(mode, today, month, from, to);
  const rangeFrom = range?.from;
  const rangeTo = range?.to;
  const report = useMemo(
    () =>
      rangeFrom && rangeTo ? buildReport(data, { from: rangeFrom, to: rangeTo }, today) : null,
    [data, today, rangeFrom, rangeTo],
  );

  const download = async () => {
    if (!report) return;
    setGenerating(true);
    setFailure(null);
    try {
      // Loaded on demand: the XLSX library stays out of the initial bundle.
      const { buildReportWorkbook, reportFileName } = await import('@/lib/xlsx/buildWorkbook');
      const bytes = await buildReportWorkbook(report);
      const fileName = reportFileName(report.period.from, report.period.to);
      downloadBytes(new Uint8Array(bytes), fileName, XLSX_TYPE);
      toast.show({ message: `Informe descargado · ${fileName}` });
    } catch {
      setFailure('No se pudo generar el informe. Inténtalo de nuevo.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <PageHeader title="Informes" />
      {noProducts ? (
        <SetupGuide title="Aún no hay nada que informar" />
      ) : (
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-4">
            <SegmentedControl
              label="Periodo"
              options={MODES}
              value={mode}
              onChange={(next) => {
                setMode(next);
                setFailure(null);
              }}
            />
            {mode === 'month' ? (
              <TextField
                label="Mes"
                type="month"
                value={month}
                max={today.slice(0, 7)}
                onChange={setMonth}
                error={error}
              />
            ) : null}
            {mode === 'range' ? (
              <div className="grid grid-cols-1 gap-3 sheet:grid-cols-2">
                <DateField label="Desde" value={from} max={today} onChange={setFrom} />
                <DateField label="Hasta" value={to} max={today} onChange={setTo} />
              </div>
            ) : null}
            {error && mode === 'range' ? (
              <p role="alert" className="flex items-start gap-2 text-footnote text-danger">
                <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                {error}
              </p>
            ) : null}
          </Card>

          {report ? <Summary report={report} /> : null}

          <div className="flex flex-col gap-3">
            <div>
              <Button
                icon={FileSpreadsheet}
                loading={generating}
                disabled={!report}
                onClick={() => void download()}
              >
                {generating ? 'Generando…' : 'Descargar informe (Excel)'}
              </Button>
            </div>
            <p role="status" aria-live="polite" className="sr-only">
              {generating ? 'Generando el informe…' : ''}
            </p>
            {failure ? (
              <p role="alert" className="flex items-start gap-2 text-footnote text-danger">
                <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                {failure}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
