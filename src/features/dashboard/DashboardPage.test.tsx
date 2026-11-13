import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { buildSeed } from '@/data/seed/buildSeed';
import { useInventoryStore } from '@/state/store';
import { sampleData } from '@/test/fixtures';
import { DashboardPage } from './DashboardPage';

const TODAY = '2026-11-13';

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function renderPage() {
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

function load(data = buildSeed(TODAY)) {
  data.settings.todayOverride = TODAY;
  act(() => useInventoryStore.setState({ status: 'ready', data }));
}

beforeEach(() => window.localStorage.clear());

describe('DashboardPage with the demo data', () => {
  beforeEach(() => load());

  it('shows the four indicators with numbers', () => {
    renderPage();
    const indicators = screen.getByRole('region', { name: 'Indicadores' });
    for (const label of ['Por vencer ≤ 30 días', 'Vencidos', 'Por comprar', 'Riesgo de pérdida']) {
      expect(within(indicators).getByText(label)).toBeInTheDocument();
    }
    expect(within(indicators).getAllByRole('link')).toHaveLength(4);
  });

  it('every indicator links to its filtered list', () => {
    renderPage();
    const hrefs = within(screen.getByRole('region', { name: 'Indicadores' }))
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual([
      '/vencimientos?filtro=criticos',
      '/vencimientos?filtro=vencidos',
      '/compras',
      '/vencimientos?filtro=todos',
    ]);
  });

  it('lists up to 8 lots to use first and up to 8 products to buy soon', () => {
    renderPage();
    const useFirst = screen.getByRole('list', { name: 'Usar primero' });
    expect(within(useFirst).getAllByRole('listitem')).toHaveLength(8);
    const buy = screen.getByRole('list', { name: 'Comprar pronto' });
    const rows = within(buy).getAllByRole('listitem');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(8);
  });

  it('never shows NaN or Infinity', () => {
    renderPage();
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  });

  it('"Salida" opens the issue form with that product and lot', async () => {
    const user = userEvent.setup();
    renderPage();
    const useFirst = screen.getByRole('list', { name: 'Usar primero' });
    await user.click(within(useFirst).getAllByRole('button', { name: /Registrar salida de/ })[0]!);
    const where = screen.getByTestId('where').textContent!;
    expect(where).toMatch(/^\/salida\?producto=p\d+&lote=l\d+$/);
  });

  it('a row of "Comprar pronto" opens the product', async () => {
    const user = userEvent.setup();
    renderPage();
    const buy = screen.getByRole('list', { name: 'Comprar pronto' });
    await user.click(within(buy).getAllByRole('link')[0]!);
    expect(screen.getByTestId('where').textContent).toMatch(/^\/productos\/p\d+$/);
  });
});

describe('DashboardPage edge cases', () => {
  it('follows the critical days from the settings', () => {
    const data = sampleData();
    data.settings.criticalDays = 15;
    load(data);
    renderPage();
    expect(screen.getByText('Por vencer ≤ 15 días')).toBeInTheDocument();
  });

  it('shows zeros and friendly messages when there is nothing to report', () => {
    const data = sampleData();
    data.movements = [];
    data.lots = [];
    load(data);
    renderPage();
    expect(screen.getByText('Nada por usar')).toBeInTheDocument();
    const indicators = screen.getByRole('region', { name: 'Indicadores' });
    expect(within(indicators).getAllByText('0').length).toBeGreaterThanOrEqual(2);
  });

  it('shows "Todo en orden" when nothing needs buying', () => {
    const data = sampleData();
    data.products[0]!.minStock = 10;
    data.products[0]!.maxStock = 100;
    data.movements[0]!.quantity = 50;
    load(data);
    renderPage();
    expect(screen.getByText('Todo en orden')).toBeInTheDocument();
  });
});
