/// <reference types="node" />
/**
 * Timings of the derivations and persistence with ×10 data. Run with `pnpm run perf`; it is not
 * part of `pnpm run check`. Each run uses a shallow copy of the dataset so the per-dataset memo
 * never hits (the worst case: the first render after a change).
 */
import { migrate } from '@/data/migrate';
import { buildLedger } from '@/domain/ledger';
import { lotBalances, productStock } from '@/domain/stock';
import {
  deriveDashboard,
  deriveExpiringLots,
  deriveLedger,
  deriveProductRows,
  derivePurchaseList,
} from '@/state/derive';
import { largeData } from '@/test/largeData';

const today = '2026-11-13';

function measure(label: string, run: () => unknown, iterations = 10): string {
  run(); // warm-up
  const times: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const start = performance.now();
    run();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)]!;
  return `${label.padEnd(48)} mediana ${median.toFixed(2).padStart(8)} ms · máx ${times.at(-1)!.toFixed(2)} ms`;
}

it('mide derivaciones y persistencia con datos ×10', () => {
  const data = largeData({ today });
  const json = JSON.stringify(data);
  const productId = data.products[1]!.id;
  const fresh = () => ({ ...data });
  const lines = [
    `Datos: ${data.products.length} productos, ${data.lots.length} lotes, ${data.movements.length} movimientos`,
    `JSON: ${(json.length / 1024 / 1024).toFixed(2)} MB (${json.length.toLocaleString('es-SV')} caracteres; la cuota típica de localStorage es ≈ 5 M caracteres)`,
    measure('deriveProductRows', () => deriveProductRows(fresh(), today)),
    measure('deriveExpiringLots (con filas)', () => deriveExpiringLots(fresh(), today)),
    measure('derivePurchaseList (con filas)', () => derivePurchaseList(fresh(), today)),
    measure('deriveDashboard (todo)', () => deriveDashboard(fresh(), today)),
    measure('deriveLedger (un producto)', () => deriveLedger(data, productId, today)),
    measure('buildLedger (un producto)', () => buildLedger(data, productId, 40)),
    measure('productStock (un producto, todos los datos)', () =>
      productStock(data, productId, today),
    ),
    measure('lotBalances (todos los lotes)', () => lotBalances(data)),
    measure('JSON.stringify', () => JSON.stringify(data)),
    measure('JSON.parse + migrate', () => migrate(JSON.parse(json))),
  ];
  process.stdout.write(`\n${lines.join('\n')}\n\n`);
});
