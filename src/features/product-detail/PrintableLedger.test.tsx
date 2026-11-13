import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { InventoryData, Lot, Movement } from '@/domain/types';
import { useInventoryStore } from '@/state/store';
import { installDialogPolyfill } from '@/test/dialog-polyfill';
import { sampleData } from '@/test/fixtures';
import { ToastProvider } from '@/ui';
import { ProductDetailPage } from './ProductDetailPage';

const TODAY = '2026-11-13';

function lot(id: string, lotNumber: string, expiryDate: string, extra: Partial<Lot> = {}): Lot {
  return { id, productId: 'p1', lotNumber, expiryDate, receivedDate: '2026-06-01', ...extra };
}

let sequence = 0;
function movement(
  type: Movement['type'],
  date: string,
  lotId: string,
  quantity: number,
  extra: Partial<Movement> = {},
): Movement {
  sequence += 1;
  return {
    id: `m-${sequence}`,
    type,
    date,
    productId: 'p1',
    lotId,
    quantity,
    concept: type === 'receipt' ? 'Compra' : 'Consumo',
    createdAt: `${date}T08:00:${String(sequence).padStart(2, '0')}.000Z`,
    ...extra,
  };
}

function buildData(): InventoryData {
  sequence = 0;
  const data = sampleData();
  data.settings.todayOverride = TODAY;
  data.settings.labName = 'Laboratorio Clínico Hospital Nacional';
  data.fundingSources = [
    { code: 1, name: 'GOES' },
    { code: 2, name: 'Donación' },
  ];
  data.products = [
    {
      id: 'p1',
      name: 'Glucosa',
      areaId: 'a1',
      packaging: 'Caja',
      unit: 'prueba',
      unitsPerPackage: 24,
      code: '30106548',
      cardNumber: 'LRC-02-24',
      minStock: 60,
      maxStock: 300,
      avgMonthlyConsumption: 60,
    },
    { id: 'p2', name: 'Hemograma', areaId: 'a1', unit: 'prueba' },
  ];
  data.lots = [
    lot('l-a', 'LT-A', '2026-12-01', { sourceCode: 1, unitPrice: 0.5 }),
    lot('l-b', 'LT-B', '2027-06-30', { receivedDate: '2026-08-01' }),
  ];
  data.movements = [
    movement('receipt', '2026-06-01', 'l-a', 120, { sourceCode: 1, unitPrice: 0.5 }),
    movement('receipt', '2026-08-01', 'l-b', 48),
    movement('issue', '2026-11-02', 'l-b', 12, { fefoOverrideReason: 'Lote abierto en el equipo' }),
    movement('issue', '2026-11-10', 'l-a', 20, { unitPrice: 0.5 }),
    { ...movement('receipt', '2026-08-01', 'l-b', 5), productId: 'p2' },
  ];
  return data;
}

beforeAll(installDialogPolyfill);

function renderPage(path = '/productos/p1', data: InventoryData = buildData()) {
  act(() => useInventoryStore.setState({ status: 'ready', loadError: undefined, data }));
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <Routes>
          <Route path="/productos/:id" element={<ProductDetailPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

/** The print-only card; jsdom does not evaluate `@media print`, so it is queried by its mark. */
function card(): HTMLElement {
  const element = document.querySelector<HTMLElement>('[data-print="card"]');
  if (!element) throw new Error('printable card not found');
  return element;
}

function cardBodyRows(): HTMLElement[] {
  return within(card()).getAllByRole('row', { hidden: true }).slice(2);
}

const cells = (row: HTMLElement) =>
  within(row)
    .getAllByRole('cell', { hidden: true })
    .map((cell) => cell.textContent);

describe('Kardex printing', () => {
  afterEach(() => vi.restoreAllMocks());

  it('"Imprimir" opens the print dialog', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Imprimir' }));
    expect(print).toHaveBeenCalledOnce();
  });

  it('is disabled when there is nothing to print', () => {
    renderPage(
      '/productos/p2',
      (() => {
        const data = buildData();
        data.movements = [];
        return data;
      })(),
    );
    expect(screen.getByRole('button', { name: 'Imprimir' })).toBeDisabled();
  });

  it('has the establishment, the card title, the product data and the print date', () => {
    renderPage();
    const view = within(card());
    expect(view.getByText('Laboratorio Clínico Hospital Nacional')).toBeInTheDocument();
    expect(
      view.getByRole('heading', { name: 'Tarjeta de control de existencias', hidden: true }),
    ).toBeInTheDocument();
    expect(card()).toHaveTextContent('Todos los movimientos');
    expect(card()).toHaveTextContent('Producto:Glucosa');
    expect(card()).toHaveTextContent('Código MINSAL:30106548');
    expect(card()).toHaveTextContent('N.º de tarjeta:LRC-02-24');
    expect(card()).toHaveTextContent('Área:Química seca');
    expect(card()).toHaveTextContent('Presentación:Caja de 24 pruebas');
    expect(card()).toHaveTextContent('Unidad:prueba');
    expect(card()).toHaveTextContent('Existencia mínima:60 pruebas');
    expect(card()).toHaveTextContent('Existencia máxima:300 pruebas');
    expect(card()).toHaveTextContent(/Consumo promedio mensual:\d+ pruebas/);
    expect(card()).toHaveTextContent('Impreso el 13 nov 2026');
  });

  it('has every kardex column', () => {
    renderPage();
    const headers = within(card())
      .getAllByRole('columnheader', { hidden: true })
      .map((header) => header.textContent);
    expect(headers).toEqual([
      'Fecha',
      'Concepto',
      'Procedencia',
      'N.º de lote',
      'Vencimiento',
      'Entrada',
      'Salida',
      'Saldo',
      'Cobertura (meses)',
      'Cant.',
      'Precio',
      'Cant.',
      'Precio',
    ]);
  });

  it('prints every row chronologically with the running balance', () => {
    renderPage();
    const rows = cardBodyRows();
    expect(rows).toHaveLength(4);
    expect(rows.map((row) => cells(row)[9])).toEqual(['120', '168', '156', '136']);
    const [receipt] = rows.map(cells);
    expect(receipt).toEqual([
      '1 jun 2026',
      'Compra',
      'GOES',
      'LT-A',
      '1 dic 2026',
      '120',
      '$0.50',
      '—',
      '—',
      '120',
      expect.stringMatching(/^\d(\.\d)?$/),
    ]);
    expect(cells(rows[3]!).slice(5, 9)).toEqual(['—', '—', '20', '$0.50']);
  });

  it('respects the on-screen date filter and says so in the heading', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-01' } });
    expect(card()).toHaveTextContent('Desde el 1 nov 2026');
    expect(cardBodyRows()).toHaveLength(2);

    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-05' } });
    expect(card()).toHaveTextContent('Del 1 nov 2026 al 5 nov 2026');
    const rows = cardBodyRows();
    expect(rows).toHaveLength(1);
    expect(cells(rows[0]!)[9]).toBe('156'); // the true balance, not restarted by the filter
  });

  it('shows "—" for coverage when there is no consumption', () => {
    renderPage('/productos/p2');
    const [row] = cardBodyRows();
    expect(cells(row!)[10]).toBe('—');
    expect(card()).toHaveTextContent('Consumo promedio mensual:—');
    expect(card()).toHaveTextContent('Existencia mínima:—');
  });

  it('marks FEFO overrides with "*" and a footnote with the reason', () => {
    renderPage();
    const rows = cardBodyRows();
    expect(cells(rows[2]!)[1]).toBe('Consumo *');
    expect(cells(rows[3]!)[1]).toBe('Consumo');
    expect(card()).toHaveTextContent(
      '* Salida fuera de orden FEFO (2 nov 2026, lote LT-B): Lote abierto en el equipo',
    );
  });

  it('is hidden on screen and from assistive technology, and only visible when printing', () => {
    renderPage();
    expect(card()).toHaveAttribute('aria-hidden', 'true');
    expect(card()).toHaveClass('hidden', 'print:block');
  });

  it('never prints NaN, Infinity or undefined', () => {
    const { unmount } = renderPage();
    expect(card().textContent).not.toMatch(/NaN|Infinity|undefined|null/);
    unmount();
    renderPage('/productos/p2');
    expect(card().textContent).not.toMatch(/NaN|Infinity|undefined|null/);
  });
});
