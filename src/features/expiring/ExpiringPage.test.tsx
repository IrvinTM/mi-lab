import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { buildSeed } from '@/data/seed/buildSeed';
import type { InventoryData, Lot, Movement, Settings } from '@/domain/types';
import { useInventoryStore } from '@/state/store';
import { sampleData } from '@/test/fixtures';
import { ExpiringPage } from './ExpiringPage';

const TODAY = '2026-11-13';

function lotWithReceipt(
  id: string,
  productId: string,
  expiryDate: string,
  quantity: number,
  unitPrice?: number,
): { lot: Lot; movement: Movement } {
  return {
    lot: {
      id,
      productId,
      lotNumber: `LT-${id}`,
      expiryDate,
      receivedDate: '2026-08-01',
      ...(unitPrice === undefined ? {} : { unitPrice }),
    },
    movement: {
      id: `m-${id}`,
      type: 'receipt',
      date: '2026-08-01',
      productId,
      lotId: id,
      quantity,
      concept: 'Compra',
      createdAt: '2026-08-01T08:00:00.000Z',
    },
  };
}

/** Glucosa (30/month): expired, critical (7 d), warning (63 d, no price). Urea: warning (48 d), ok. */
function dataset(settings: Partial<Settings> = {}): InventoryData {
  const base = sampleData();
  const specs = [
    lotWithReceipt('A', 'p1', '2026-10-20', 10, 1),
    lotWithReceipt('B', 'p1', '2026-11-20', 24, 2),
    lotWithReceipt('C', 'p1', '2027-01-15', 48),
    lotWithReceipt('D', 'p2', '2027-06-30', 100, 0.5),
    lotWithReceipt('E', 'p2', '2026-12-31', 20, 0.5),
  ];
  return {
    ...base,
    products: [
      { ...base.products[0]!, avgMonthlyConsumption: 30 },
      { id: 'p2', name: 'Urea', areaId: 'a1', unit: 'prueba' },
    ],
    lots: specs.map((s) => s.lot),
    movements: specs.map((s) => s.movement),
    settings: { ...base.settings, todayOverride: TODAY, ...settings },
  };
}

function setData(data: InventoryData) {
  act(() => useInventoryStore.setState({ status: 'ready', loadError: undefined, data }));
}

function Location() {
  const { pathname, search } = useLocation();
  return <p data-testid="location">{pathname + search}</p>;
}

function renderPage(path = '/vencimientos') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/vencimientos" element={<ExpiringPage />} />
        <Route path="*" element={<Location />} />
      </Routes>
      <Location />
    </MemoryRouter>,
  );
}

const rowsOf = () => screen.getAllByRole('listitem');
const monthHeadings = () =>
  screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);

beforeEach(() => {
  window.localStorage.clear();
  setData(dataset());
});

describe('ExpiringPage', () => {
  it('shows the title, the toolbar actions and the segments with the configured days', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Vencimientos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrada' })).toBeInTheDocument();
    const group = screen.getByRole('radiogroup', { name: 'Filtrar por vencimiento' });
    expect(
      within(group)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Vencidos', '≤ 30 días', '≤ 90 días', 'Todos']);
  });

  it('follows the settings in the segment labels and in the filters', () => {
    setData(dataset({ criticalDays: 10, warningDays: 60 }));
    renderPage('/vencimientos?filtro=advertencia');
    expect(screen.getByRole('radio', { name: '≤ 10 días' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '≤ 60 días' })).toBeChecked();
    // 7 d (Glucosa B), 48 d (Urea E); the 63 d lot is out.
    expect(rowsOf()).toHaveLength(2);
    expect(screen.queryByText(/LT-C/)).not.toBeInTheDocument();
  });

  it('lists every lot with balance under "Todos" (default)', () => {
    renderPage();
    expect(screen.getByRole('radio', { name: 'Todos' })).toBeChecked();
    expect(rowsOf()).toHaveLength(5);
  });

  it.each([
    ['vencidos', ['LT-A']],
    ['criticos', ['LT-B']],
    ['advertencia', ['LT-B', 'LT-E', 'LT-C']],
  ])('filters by ?filtro=%s', (param, lotNumbers) => {
    renderPage(`/vencimientos?filtro=${param}`);
    const found = rowsOf().map((row) => /LT-[A-E]/.exec(row.textContent ?? '')?.[0]);
    expect(found).toEqual(lotNumbers);
  });

  it('ignores an unknown ?filtro= value', () => {
    renderPage('/vencimientos?filtro=otra-cosa');
    expect(screen.getByRole('radio', { name: 'Todos' })).toBeChecked();
  });

  it('keeps the filter in the URL when it changes', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('radio', { name: 'Vencidos' }));
    expect(screen.getAllByTestId('location')[0]).toHaveTextContent('/vencimientos?filtro=vencidos');
    expect(rowsOf()).toHaveLength(1);
    await user.click(screen.getByRole('radio', { name: '≤ 90 días' }));
    expect(screen.getAllByTestId('location')[0]).toHaveTextContent(
      '/vencimientos?filtro=advertencia',
    );
  });

  it('groups by expiry month in Spanish, chronologically, expired first', () => {
    renderPage();
    expect(monthHeadings()).toEqual([
      'octubre 2026',
      'noviembre 2026',
      'diciembre 2026',
      'enero 2027',
      'junio 2027',
    ]);
    expect(rowsOf().map((row) => /LT-[A-E]/.exec(row.textContent ?? '')?.[0])).toEqual([
      'LT-A',
      'LT-B',
      'LT-E',
      'LT-C',
      'LT-D',
    ]);
  });

  it('puts an expired and an upcoming lot of the same month in one group', () => {
    setData(dataset({ todayOverride: '2026-11-25' }));
    renderPage('/vencimientos?filtro=todos');
    const november = screen.getByRole('heading', { level: 2, name: 'noviembre 2026' });
    const group = november.closest('section')!;
    expect(within(group).getAllByRole('listitem')).toHaveLength(1);
    expect(within(group).getByText(/Vencido hace 5 días/)).toBeInTheDocument();
  });

  it('shows product, lot, balance, expiry, value and the projected loss per row', () => {
    renderPage('/vencimientos?filtro=criticos');
    const row = rowsOf()[0]!;
    expect(within(row).getByText('Glucosa')).toBeInTheDocument();
    expect(within(row).getByText(/Lote LT-B/)).toBeInTheDocument();
    expect(within(row).getByText(/Saldo 1 caja/)).toBeInTheDocument();
    expect(within(row).getByText('Vence en 7 días')).toBeInTheDocument();
    expect(within(row).getByText('$48.00')).toBeInTheDocument();
    expect(within(row).getByText(/≈ 16 pruebas se vencerán sin usar/)).toBeInTheDocument();
  });

  it('shows "—" without price and no loss line without projected loss', () => {
    renderPage('/vencimientos?filtro=advertencia');
    const row = rowsOf().find((r) => r.textContent?.includes('LT-C'))!;
    expect(within(row).getByText('—')).toBeInTheDocument();
    expect(within(row).queryByText(/sin usar/)).not.toBeInTheDocument();
  });

  it('shows the totals of the current filter', async () => {
    const user = userEvent.setup();
    renderPage();
    const totals = screen.getByRole('group', { name: 'Totales' });
    // 10 + 24 + 20 + 48 + 100 units; $10 + $48 + $10 + $0 + $50.
    expect(totals).toHaveTextContent('Lotes5');
    expect(totals).toHaveTextContent('Unidades202');
    expect(totals).toHaveTextContent('Valor$118.00');
    await user.click(screen.getByRole('radio', { name: 'Vencidos' }));
    expect(totals).toHaveTextContent('Lotes1');
    expect(totals).toHaveTextContent('Unidades10');
    expect(totals).toHaveTextContent('Valor$10.00');
  });

  it('links each row to the product detail', () => {
    renderPage('/vencimientos?filtro=vencidos');
    expect(within(rowsOf()[0]!).getByRole('link')).toHaveAttribute('href', '/productos/p1');
  });

  it('opens the issue screen with the product and the lot', async () => {
    const user = userEvent.setup();
    renderPage('/vencimientos?filtro=criticos');
    await user.click(
      screen.getByRole('button', { name: /Registrar salida de Glucosa, lote LT-B/ }),
    );
    expect(screen.getAllByTestId('location')[0]).toHaveTextContent('/salida?producto=p1&lote=B');
  });

  it('offers no actions on expired lots', () => {
    renderPage('/vencimientos?filtro=vencidos');
    expect(screen.queryByRole('button', { name: /Registrar salida de/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Dar de baja/ })).not.toBeInTheDocument();
  });

  it.each([
    ['vencidos', 'No hay lotes vencidos'],
    ['criticos', 'No hay lotes por vencer'],
    ['advertencia', 'No hay lotes por vencer'],
    ['todos', 'No hay lotes con saldo'],
  ])('shows an empty state for ?filtro=%s', (param, title) => {
    setData({ ...dataset(), lots: [], movements: [] });
    renderPage(`/vencimientos?filtro=${param}`);
    expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Totales' })).not.toBeInTheDocument();
  });

  it('never shows NaN or Infinity with the full demo seed', () => {
    const seed = buildSeed(TODAY);
    setData({ ...seed, settings: { ...seed.settings, todayOverride: TODAY } });
    const { container } = renderPage('/vencimientos?filtro=todos');
    expect(rowsOf().length).toBeGreaterThan(20);
    expect(container.textContent).not.toMatch(/NaN|Infinity|undefined/);
  });
});
