import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { ToastProvider } from '@/ui';
import type { InventoryData, Lot, Movement } from '@/domain/types';
import { useInventoryStore } from '@/state/store';
import { lotBalance } from '@/domain/stock';
import { installDialogPolyfill } from '@/test/dialog-polyfill';
import { sampleData } from '@/test/fixtures';
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

/**
 * Glucosa: an expired lot (10), LT-A (100, expires in 18 days), LT-B (36, far away) and an
 * empty lot. Usable 136 = 5 boxes + 16, expired 10.
 */
function buildData(): InventoryData {
  sequence = 0;
  const data = sampleData();
  data.settings.todayOverride = TODAY;
  data.fundingSources = [
    { code: 1, name: 'GOES' },
    { code: 2, name: 'Donación' },
  ];
  data.products = [
    {
      id: 'p1',
      name: 'Glucosa',
      areaId: 'a1',
      unit: 'prueba',
      unitsPerPackage: 24,
      code: '30106548',
      cardNumber: 'LRC-02-24',
      minStock: 60,
      maxStock: 300,
      avgMonthlyConsumption: 60,
    },
    { id: 'p2', name: 'Hemograma', areaId: 'a1', unit: 'prueba' },
    { id: 'p3', name: 'Urea', areaId: 'a1', unit: 'frasco' },
  ];
  data.lots = [
    lot('l-old', 'LT-OLD', '2026-10-01', { sourceCode: 2 }),
    lot('l-a', 'LT-A', '2026-12-01', { sourceCode: 1, unitPrice: 0.5 }),
    lot('l-b', 'LT-B', '2027-06-30', { receivedDate: '2026-08-01' }),
    lot('l-e', 'LT-E', '2027-01-01', { receivedDate: '2026-08-01' }),
    lot('l-u', 'LT-U', '2027-05-01', { productId: 'p3' }),
  ];
  data.movements = [
    movement('receipt', '2026-06-01', 'l-old', 10),
    movement('receipt', '2026-06-01', 'l-a', 120, { sourceCode: 1, unitPrice: 0.5 }),
    movement('receipt', '2026-08-01', 'l-b', 48),
    movement('receipt', '2026-08-01', 'l-e', 10),
    movement('issue', '2026-09-01', 'l-e', 10),
    movement('issue', '2026-11-02', 'l-b', 12, { fefoOverrideReason: 'Lote abierto en el equipo' }),
    movement('issue', '2026-11-10', 'l-a', 20),
    { ...movement('receipt', '2026-08-01', 'l-u', 5), productId: 'p3' },
  ];
  return data;
}

beforeAll(installDialogPolyfill);

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <p data-testid="location">{pathname + search}</p>;
}

function renderPage(path = '/productos/p1', data: InventoryData = buildData()) {
  act(() => useInventoryStore.setState({ status: 'ready', loadError: undefined, data }));
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <Routes>
          <Route path="/productos/:id" element={<ProductDetailPage />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

function bodyRows(table: HTMLElement): HTMLElement[] {
  return within(table).getAllByRole('row').slice(1);
}

function stat(label: string): HTMLElement {
  return screen.getByText(label).parentElement!;
}

function expectNoBrokenNumbers() {
  expect(document.body.textContent).not.toMatch(/NaN|Infinity|undefined|null/);
}

describe('ProductDetailPage', () => {
  it('says so when the product does not exist', () => {
    renderPage('/productos/nope');
    expect(screen.getByRole('heading', { name: 'Producto no encontrado' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a Productos' })).toHaveAttribute(
      'href',
      '/productos',
    );
  });

  it('shows the name, identifiers, back link and the actions with the product preselected', async () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Glucosa' })).toBeInTheDocument();
    expect(
      screen.getByText('Química seca · Código 30106548 · Tarjeta LRC-02-24'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Productos' })).toHaveAttribute('href', '/productos');
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Salida' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/salida?producto=p1');
  });

  describe('metrics', () => {
    it('shows usable and expired stock in boxes, limits and the purchase suggestion', () => {
      renderPage();
      expect(stat('Saldo útil')).toHaveTextContent('≈ 5 cajas + 16 pruebas');
      expect(stat('Vencido')).toHaveTextContent('10 pruebas');
      expect(stat('Mínimo / máximo')).toHaveTextContent('60 / 300');
      expect(stat('Compra sugerida')).toHaveTextContent(/Comprar \d+ cajas/);
      expect(stat('Cobertura efectiva')).toHaveTextContent(/\d(\.\d)? mes/);
    });

    it('tells where the consumption comes from', () => {
      const manual = buildData();
      manual.movements = manual.movements.filter((entry) => entry.type === 'receipt');
      const { unmount } = renderPage('/productos/p1', manual);
      expect(stat('Consumo promedio')).toHaveTextContent('60 pruebas');
      expect(stat('Consumo promedio')).toHaveTextContent('manual');
      unmount();

      renderPage();
      expect(stat('Consumo promedio')).toHaveTextContent(/calculado \(\d(\.\d)? meses\)/);
    });
  });

  describe('lots', () => {
    it('marks the first usable lot with "Usar este primero" and hides empty lots', () => {
      renderPage();
      const table = screen.getByRole('table', { name: /Lotes con saldo/ });
      const rows = bodyRows(table);
      expect(rows).toHaveLength(2);
      expect(within(rows[0]!).getByText('LT-A')).toBeInTheDocument();
      expect(within(rows[0]!).getByText('Usar este primero')).toBeInTheDocument();
      expect(within(rows[0]!).getByText('Vence en 18 días')).toBeInTheDocument();
      expect(within(rows[0]!).getByText('GOES')).toBeInTheDocument();
      expect(within(rows[1]!).getByText('LT-B')).toBeInTheDocument();
      expect(within(rows[1]!).queryByText('Usar este primero')).not.toBeInTheDocument();
      expect(screen.getAllByText('Usar este primero')).toHaveLength(1);
      expect(within(table).queryByText('LT-E')).not.toBeInTheDocument();
    });

    it('groups expired lots at the end under "Vencidos"', () => {
      renderPage();
      const heading = screen.getByRole('heading', { name: 'Vencidos' });
      const lots = screen.getByRole('table', { name: /Lotes con saldo/ });
      const expired = screen.getByRole('table', { name: 'Lotes vencidos con saldo' });
      expect(lots.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(
        heading.compareDocumentPosition(expired) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      const [row] = bodyRows(expired);
      expect(within(row!).getByText('LT-OLD')).toBeInTheDocument();
      expect(within(row!).getByText('Donación')).toBeInTheDocument();
      expect(within(row!).getByText(/Vencido hace 43 días/)).toBeInTheDocument();
      expect(within(row!).queryByText('Usar este primero')).not.toBeInTheDocument();
      expect(within(lots).queryByText('LT-OLD')).not.toBeInTheDocument();
    });

    it('projects what will expire unused and what will be used in full', () => {
      renderPage();
      const [first, second] = bodyRows(screen.getByRole('table', { name: /Lotes con saldo/ }));
      expect(first).toHaveTextContent(/≈ \d+ pruebas se vencerán sin usar/);
      expect(second).toHaveTextContent('Se usará por completo');
    });

    it('says "Sin consumo registrado" instead of a projection when there is no consumption', () => {
      renderPage('/productos/p3');
      const [row] = bodyRows(screen.getByRole('table', { name: /Lotes con saldo/ }));
      expect(row).toHaveTextContent('LT-U');
      expect(row).toHaveTextContent('Sin consumo registrado');
      expect(stat('Consumo promedio')).toHaveTextContent('Sin consumo registrado');
      expectNoBrokenNumbers();
    });

    it('shows no "Vencidos" group when nothing expired has balance', () => {
      const data = buildData();
      data.lots = data.lots.filter((entry) => entry.id !== 'l-old');
      data.movements = data.movements.filter((entry) => entry.lotId !== 'l-old');
      renderPage('/productos/p1', data);
      expect(screen.queryByRole('heading', { name: 'Vencidos' })).not.toBeInTheDocument();
    });
  });

  describe('ledger', () => {
    it('lists the movements chronologically with the running balance', () => {
      renderPage();
      const rows = bodyRows(screen.getByRole('table', { name: /Kardex/ }));
      expect(rows).toHaveLength(7);
      const balances = rows.map((row) => within(row).getAllByRole('cell')[7]!.textContent);
      expect(balances).toEqual(['10', '130', '178', '188', '178', '166', '146']);
      expect(rows[1]).toHaveTextContent('LT-A');
      expect(rows[1]).toHaveTextContent('GOES');
      expect(rows[1]).toHaveTextContent('120');
      expect(rows[1]).toHaveTextContent('$0.50');
      expect(rows[1]).toHaveTextContent('1 dic 2026');
      expect(rows[1]).toHaveTextContent(/\d(\.\d)? meses?/);
    });

    it('filters by date, keeps the true balance and clears the filter', async () => {
      renderPage();
      const table = screen.getByRole('table', { name: /Kardex/ });
      const clear = screen.getByRole('button', { name: 'Limpiar' });
      expect(clear).toBeDisabled();

      fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-01' } });
      const rows = bodyRows(table);
      expect(rows).toHaveLength(2);
      expect(within(rows[0]!).getAllByRole('cell')[7]).toHaveTextContent('166');

      fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-05' } });
      expect(bodyRows(table)).toHaveLength(1);

      await userEvent.click(clear);
      expect(bodyRows(table)).toHaveLength(7);
      expect(screen.getByLabelText('Desde')).toHaveValue('');
    });

    it('explains an empty range and an inverted range', () => {
      renderPage();
      fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-12' } });
      fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-01' } });
      expect(screen.getByText('No hay movimientos en estas fechas.')).toBeInTheDocument();
      expect(screen.getByText('La fecha final es anterior a la inicial')).toBeInTheDocument();
    });

    it('warns in text when an issue did not follow FEFO', () => {
      renderPage();
      const rows = bodyRows(screen.getByRole('table', { name: /Kardex/ }));
      expect(rows[5]).toHaveTextContent('Fuera de orden FEFO: Lote abierto en el equipo');
      expect(rows.filter((row) => /Fuera de orden FEFO/.test(row.textContent ?? ''))).toHaveLength(
        1,
      );
    });
  });

  it('survives a product with no lots and no consumption without NaN or Infinity', () => {
    renderPage('/productos/p2');
    expect(screen.getByRole('heading', { level: 1, name: 'Hemograma' })).toBeInTheDocument();
    expect(screen.getByText('No hay lotes vigentes con saldo.')).toBeInTheDocument();
    expect(screen.getByText('Aún no hay movimientos.')).toBeInTheDocument();
    expect(stat('Cobertura efectiva')).toHaveTextContent('—');
    expect(stat('Mínimo / máximo')).toHaveTextContent('—');
    expect(screen.getByText('Agotado')).toBeInTheDocument();
    expectNoBrokenNumbers();
  });

  it('never prints NaN or Infinity for the full product either', () => {
    renderPage();
    expectNoBrokenNumbers();
  });
});

describe('inventory actions on the detail page', () => {
  const state = () => useInventoryStore.getState().data;
  const balance = (lotId: string) =>
    lotBalance(
      state().lots.find((l) => l.id === lotId)!,
      state().movements,
    );

  describe('Editar', () => {
    it('opens a sheet with the current values and saves the changes', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole('button', { name: 'Editar' }));
      const dialog = screen.getByRole('dialog', { name: 'Editar producto' });
      expect(within(dialog).getByLabelText('Nombre')).toHaveValue('Glucosa');
      expect(within(dialog).getByLabelText('Existencia mínima')).toHaveValue('60');
      expect(within(dialog).getByLabelText('Unidades por presentación')).toHaveValue('24');

      const min = within(dialog).getByLabelText('Existencia mínima');
      await user.clear(min);
      await user.type(min, '80');
      await user.clear(within(dialog).getByLabelText('Consumo promedio mensual (manual)'));
      await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

      const product = state().products.find((p) => p.id === 'p1')!;
      expect(product.minStock).toBe(80);
      expect(product.avgMonthlyConsumption).toBeUndefined(); // an empty field removes the value
      expect(product.maxStock).toBe(300);
      expect(await screen.findByText('Producto actualizado · Glucosa')).toBeInTheDocument();
    });

    it('rejects an empty name and a maximum below the minimum', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole('button', { name: 'Editar' }));
      const dialog = screen.getByRole('dialog', { name: 'Editar producto' });
      await user.clear(within(dialog).getByLabelText('Nombre'));
      const max = within(dialog).getByLabelText('Existencia máxima');
      await user.clear(max);
      await user.type(max, '10');
      await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
      expect(within(dialog).getByText('Ingresa el nombre del producto.')).toBeInTheDocument();
      expect(
        within(dialog).getByText('El máximo no puede ser menor que el mínimo.'),
      ).toBeInTheDocument();
      expect(state().products[0]!.name).toBe('Glucosa');
    });

    it('Cancelar discards the changes', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole('button', { name: 'Editar' }));
      const dialog = screen.getByRole('dialog', { name: 'Editar producto' });
      await user.type(within(dialog).getByLabelText('Nombre'), ' X');
      await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
      expect(state().products[0]!.name).toBe('Glucosa');
    });
  });

  describe('Dar de baja', () => {
    it('writes off an expired lot after confirming', async () => {
      const user = userEvent.setup();
      renderPage();
      expect(balance('l-old')).toBe(10);
      await user.click(screen.getByRole('button', { name: 'Dar de baja el lote LT-OLD' }));
      await user.click(
        within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Dar de baja' }),
      );
      expect(balance('l-old')).toBe(0);
      expect(
        await screen.findByText('Baja registrada · Glucosa · Lote LT-OLD · 10 pruebas'),
      ).toBeInTheDocument();
    });

    it('is not offered on lots that have not expired', () => {
      renderPage();
      expect(
        screen.queryByRole('button', { name: 'Dar de baja el lote LT-A' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('Ajustar', () => {
    const open = async (user: ReturnType<typeof userEvent.setup>, lotNumber = 'LT-A') => {
      await user.click(screen.getByRole('button', { name: `Ajustar saldo del lote ${lotNumber}` }));
      return screen.getByRole('dialog', { name: 'Ajustar saldo del lote' });
    };

    it('records a decrease with its reason and can be undone', async () => {
      const user = userEvent.setup();
      renderPage();
      const before = balance('l-a');
      const dialog = await open(user);
      expect(dialog).toHaveTextContent('Glucosa · Lote LT-A · Saldo actual: 100 pruebas');
      await user.type(within(dialog).getByLabelText('Cantidad'), '5');
      await user.type(within(dialog).getByLabelText('Motivo'), 'Conteo físico');
      await user.click(within(dialog).getByRole('button', { name: 'Registrar ajuste' }));

      expect(balance('l-a')).toBe(before - 5);
      expect(state().movements.at(-1)).toMatchObject({
        type: 'adjustment',
        quantity: -5,
        concept: 'Ajuste: Conteo físico',
      });
      expect(
        await screen.findByText(/Ajuste registrado · Glucosa · Lote LT-A · −5 pruebas/),
      ).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Deshacer' }));
      expect(balance('l-a')).toBe(before);
    });

    it('can increase the balance', async () => {
      const user = userEvent.setup();
      renderPage();
      const before = balance('l-a');
      const dialog = await open(user);
      await user.selectOptions(within(dialog).getByLabelText('Tipo de ajuste'), 'increase');
      await user.type(within(dialog).getByLabelText('Cantidad'), '3');
      await user.type(within(dialog).getByLabelText('Motivo'), 'Sobrante');
      await user.click(within(dialog).getByRole('button', { name: 'Registrar ajuste' }));
      expect(balance('l-a')).toBe(before + 3);
    });

    it('requires a reason and cannot leave the lot below zero', async () => {
      const user = userEvent.setup();
      renderPage();
      const before = state().movements.length;
      const dialog = await open(user);
      await user.type(within(dialog).getByLabelText('Cantidad'), '5');
      await user.click(within(dialog).getByRole('button', { name: 'Registrar ajuste' }));
      expect(within(dialog).getByText('Indica el motivo del ajuste.')).toBeInTheDocument();

      await user.clear(within(dialog).getByLabelText('Cantidad'));
      await user.type(within(dialog).getByLabelText('Cantidad'), '1000');
      await user.type(within(dialog).getByLabelText('Motivo'), 'Error');
      await user.click(within(dialog).getByRole('button', { name: 'Registrar ajuste' }));
      expect(
        within(dialog).getByText('El ajuste dejaría el saldo del lote en negativo.'),
      ).toBeInTheDocument();
      expect(state().movements).toHaveLength(before);
    });
  });
});
