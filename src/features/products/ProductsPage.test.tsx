import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { buildSeed } from '@/data/seed/buildSeed';
import { useInventoryStore } from '@/state/store';
import { sampleData } from '@/test/fixtures';
import { ProductsPage } from './ProductsPage';

const TODAY = '2026-11-13';

function seedData() {
  const data = buildSeed(TODAY);
  return { ...data, settings: { ...data.settings, todayOverride: TODAY } };
}

function setData(data: ReturnType<typeof seedData>) {
  act(() => useInventoryStore.setState({ status: 'ready', data }));
}

function Detail() {
  return <p>Detalle {useLocation().pathname}</p>;
}

function renderPage(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/productos', state }]}>
      <Routes>
        <Route path="/productos" element={<ProductsPage />} />
        <Route path="/productos/:id" element={<Detail />} />
        <Route path="*" element={<p>Otra ruta</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockViewport(desktop: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: desktop,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

function bodyRowNames(): string[] {
  const table = screen.getByRole('table', { name: 'Productos' });
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map(
      (row) =>
        within(row).getAllByRole('cell')[0]!.querySelector('.font-medium')!.textContent ?? '',
    );
}

beforeEach(() => {
  mockViewport(true);
  setData(seedData());
});

afterEach(() => {
  // @ts-expect-error restore the jsdom default (no matchMedia)
  delete window.matchMedia;
});

describe('ProductsPage (desktop)', () => {
  it('shows the table with the five columns and the result count', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Productos' })).toBeInTheDocument();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual([
      'Producto',
      'Saldo útil',
      'Cobertura',
      'Próximo vencimiento',
      'Estado de compra',
    ]);
    expect(screen.getByText('122 productos')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Productos' })).not.toBeInTheDocument();
  });

  it('sorts by name by default and never prints NaN or Infinity', () => {
    const { container } = renderPage();
    const names = bodyRowNames();
    const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
    expect(names.length).toBe(122);
    expect(names).toEqual([...names].sort(collator.compare));
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
    expect(screen.getByRole('columnheader', { name: /Producto/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  it('shows "—" coverage for products without consumption', () => {
    renderPage();
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    const dashes = rows.filter((row) => within(row).getAllByRole('cell')[2]!.textContent === '—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('filters by name ignoring case and accents', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole('searchbox', { name: 'Buscar productos' }), 'ACIDO URICO');
    await screen.findByText(/^\d+ productos?$/, { selector: 'p' });
    const names = bodyRowNames();
    expect(names.length).toBeGreaterThan(0);
    expect(names.length).toBeLessThan(122);
    for (const name of names) expect(name).toMatch(/^Ácido úrico/);
  });

  it('finds a product by lot number', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole('searchbox'), 'lt231936');
    expect(await screen.findByText('1 producto')).toBeInTheDocument();
    expect(bodyRowNames()[0]).toContain('Glucosa');
  });

  it('filters by area', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.selectOptions(screen.getByLabelText('Área'), 'Coagulación');
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(122);
    for (const row of rows) {
      expect(within(row).getAllByRole('cell')[0]!.textContent).toMatch(/Coagulación$/);
    }
  });

  it('filters by purchase status', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.selectOptions(screen.getByLabelText('Estado de compra'), 'Agotado');
    const names = bodyRowNames();
    expect(names).toHaveLength(6);
    const table = screen.getByRole('table');
    expect(within(table).getAllByText('Agotado')).toHaveLength(6);
  });

  it('sorts by a column and toggles direction', async () => {
    const user = userEvent.setup();
    renderPage();
    const header = () => screen.getByRole('columnheader', { name: /Saldo útil/ });
    await user.click(within(header()).getByRole('button'));
    expect(header()).toHaveAttribute('aria-sort', 'ascending');
    const asc = bodyRowNames();
    await user.click(within(header()).getByRole('button'));
    expect(header()).toHaveAttribute('aria-sort', 'descending');
    expect(bodyRowNames()).not.toEqual(asc);
  });

  it('opens the product detail when clicking a row', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole('searchbox'), 'lt231936');
    await screen.findByText('1 producto');
    await user.click(within(screen.getByRole('table')).getAllByRole('row')[1]!);
    expect(screen.getByText('Detalle /productos/p001')).toBeInTheDocument();
  });

  it('opens the detail with the keyboard', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole('searchbox'), 'lt231936');
    await screen.findByText('1 producto');
    within(screen.getByRole('table')).getAllByRole('row')[1]!.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('Detalle /productos/p001')).toBeInTheDocument();
  });

  it('shows an empty state with "Limpiar filtros" that resets everything', async () => {
    const user = userEvent.setup();
    renderPage();
    const search = screen.getByRole('searchbox');
    await user.type(search, 'zzzz-no-existe');
    expect(await screen.findByText('Sin resultados')).toBeInTheDocument();
    expect(screen.getByText('0 productos')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(search).toHaveValue('');
    expect(screen.getByLabelText('Área')).toHaveValue('all');
    expect(await screen.findByText('122 productos')).toBeInTheDocument();
  });

  it('focuses the search field when arriving with focusSearch', () => {
    renderPage({ focusSearch: true });
    expect(screen.getByRole('searchbox')).toHaveFocus();
  });

  it('does not focus the search field otherwise', () => {
    renderPage();
    expect(screen.getByRole('searchbox')).not.toHaveFocus();
  });
});

describe('ProductsPage (few areas)', () => {
  it('uses a segmented control when the areas fit', async () => {
    const user = userEvent.setup();
    setData({ ...seedData(), ...sampleData(), settings: seedData().settings });
    renderPage();
    const group = screen.getByRole('radiogroup', { name: 'Área' });
    expect(
      within(group)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Todas', 'Química seca']);
    await user.click(within(group).getByRole('radio', { name: 'Química seca' }));
    expect(screen.getByText('1 producto')).toBeInTheDocument();
  });
});

describe('ProductsPage (mobile)', () => {
  it('renders a list instead of a table and navigates on tap', async () => {
    mockViewport(false);
    const user = userEvent.setup();
    const { container } = renderPage();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Productos' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(122);
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
    await user.type(screen.getByRole('searchbox'), 'lt231936');
    await screen.findByText('1 producto');
    await user.click(within(screen.getByRole('list', { name: 'Productos' })).getByRole('link'));
    expect(screen.getByText('Detalle /productos/p001')).toBeInTheDocument();
  });
});
