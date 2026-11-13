import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { buildSeed } from '@/data/seed/buildSeed';
import type { InventoryData } from '@/domain/types';
import { useInventoryStore } from '@/state/store';
import { sampleData } from '@/test/fixtures';
import { PurchasingPage } from './PurchasingPage';

const TODAY = '2026-11-13';

function mockViewport(wide: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: wide,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

function renderPage(data: InventoryData) {
  act(() => useInventoryStore.setState({ status: 'ready', loadError: undefined, data }));
  return render(
    <MemoryRouter initialEntries={['/compras']}>
      <Routes>
        <Route path="/compras" element={<PurchasingPage />} />
        <Route path="/productos/:id" element={<h1>Detalle</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Products: p1 out of stock, p2 needs 3 boxes, p3 has no package size, p4 has no consumption. */
function purchaseData(): InventoryData {
  const base = sampleData();
  const receipt = (id: string, productId: string, quantity: number) => ({
    id: `m-${id}`,
    type: 'receipt' as const,
    date: '2026-10-01',
    productId,
    lotId: id,
    quantity,
    concept: 'Compra',
    createdAt: '2026-10-01T08:00:00.000Z',
  });
  const lot = (id: string, productId: string) => ({
    id,
    productId,
    lotNumber: id.toUpperCase(),
    expiryDate: '2027-12-31',
    receivedDate: '2026-10-01',
  });
  return {
    ...base,
    settings: { ...base.settings, todayOverride: TODAY },
    products: [
      {
        id: 'p1',
        name: 'Glucosa',
        areaId: 'a1',
        unit: 'prueba',
        unitsPerPackage: 24,
        minStock: 10,
        maxStock: 100,
      },
      {
        id: 'p2',
        name: 'Urea',
        areaId: 'a1',
        unit: 'prueba',
        unitsPerPackage: 24,
        minStock: 50,
        maxStock: 120,
      },
      { id: 'p3', name: 'Tiras', areaId: 'a1', unit: 'tira', minStock: 20, maxStock: 100 },
      { id: 'p4', name: 'Creatinina', areaId: 'a1', unit: 'prueba', unitsPerPackage: 24 },
    ],
    lots: [lot('l2', 'p2'), lot('l3', 'p3'), lot('l4', 'p4')],
    movements: [receipt('l2', 'p2', 48), receipt('l3', 'p3', 15), receipt('l4', 'p4', 30)],
  };
}

beforeEach(() => {
  window.localStorage.clear();
  mockViewport(true);
});

describe('PurchasingPage (desktop)', () => {
  it('splits the list into "Comprar" and "Configura el consumo", out of stock first', () => {
    renderPage(purchaseData());
    expect(screen.getByRole('heading', { level: 1, name: 'Compras' })).toBeInTheDocument();
    const buy = screen.getByRole('table', { name: 'Comprar' });
    const names = within(buy)
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[0]!.textContent);
    expect(names).toEqual([
      expect.stringContaining('Glucosa'),
      expect.stringContaining('Tiras'),
      expect.stringContaining('Urea'),
    ]);
    expect(within(buy).getByText('Agotado')).toBeInTheDocument();
    const configure = screen.getByRole('table', { name: 'Configura el consumo' });
    expect(within(configure).getByText('Creatinina')).toBeInTheDocument();
    expect(screen.getByText(/Define el consumo promedio o el mínimo/)).toBeInTheDocument();
  });

  it('suggests boxes and base units, or units only without package size', () => {
    renderPage(purchaseData());
    // Urea: usable 48, max 120 → 72 units = 3 boxes of 24.
    expect(screen.getByText('Comprar 3 cajas (72 pruebas)')).toBeInTheDocument();
    // Glucosa is out of stock: 100 units → 5 boxes rounded up.
    expect(screen.getByText('Comprar 5 cajas (120 pruebas)')).toBeInTheDocument();
    // Tiras has no unitsPerPackage: 100 − 15 = 85 tiras.
    expect(screen.getByText('Comprar 85 tiras')).toBeInTheDocument();
  });

  it('shows min and max, and dashes where there is no data', () => {
    renderPage(purchaseData());
    const row = screen.getByRole('row', { name: /Creatinina/ });
    const cells = within(row).getAllByRole('cell');
    expect(cells.slice(2).map((cell) => cell.textContent)).toEqual(['—', '—', '—', '—', '—']);
    const urea = within(screen.getByRole('row', { name: /Urea/ })).getAllByRole('cell');
    expect(urea[3]!.textContent).toBe('50');
    expect(urea[4]!.textContent).toBe('120');
  });

  it('summarizes how many to buy, how many are out and how many to configure', () => {
    renderPage(purchaseData());
    expect(screen.getByText('Por comprar').parentElement).toHaveTextContent('3');
    expect(screen.getByText('1 agotado')).toBeInTheDocument();
    expect(screen.getByText('Por configurar').parentElement).toHaveTextContent('1');
  });

  it('opens the product detail when a row is clicked', async () => {
    renderPage(purchaseData());
    await userEvent.click(screen.getByText('Urea'));
    expect(await screen.findByRole('heading', { name: 'Detalle' })).toBeInTheDocument();
  });

  it('links unknown products to their detail', async () => {
    renderPage(purchaseData());
    const link = screen.getByRole('link', { name: /Definir consumo o mínimo/ });
    expect(link).toHaveAttribute('href', '/productos/p4');
  });

  it('shows an empty state when nothing needs buying or configuring', () => {
    const data = purchaseData();
    renderPage({ ...data, products: [], lots: [], movements: [] });
    expect(screen.getByText('No hay nada por comprar')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('never prints NaN or Infinity with the demo data', () => {
    const seed = buildSeed(TODAY);
    const { container } = renderPage({
      ...seed,
      settings: { ...seed.settings, todayOverride: TODAY },
    });
    expect(container.textContent).not.toMatch(/NaN|Infinity|undefined/);
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1);
  });
});

describe('PurchasingPage (mobile)', () => {
  beforeEach(() => mockViewport(false));

  it('renders lists instead of tables and navigates on tap', async () => {
    renderPage(purchaseData());
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Comprar' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Configura el consumo' })).toBeInTheDocument();
    expect(screen.getByText('Comprar 3 cajas (72 pruebas)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: /Urea/ }));
    expect(await screen.findByRole('heading', { name: 'Detalle' })).toBeInTheDocument();
  });
});
