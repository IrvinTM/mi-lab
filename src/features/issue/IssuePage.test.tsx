import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { lotBalance } from '@/domain/stock';
import { useInventoryStore } from '@/state/store';
import { ToastProvider } from '@/ui';
import { installDialogPolyfill } from '@/test/dialog-polyfill';
import { sampleData } from '@/test/fixtures';
import { IssuePage } from './IssuePage';

const TODAY = '2026-11-13';

/** Product p1 with: an expired lot (10), one expiring in 9 days (12), one far away (48). */
function dataset() {
  const data = sampleData();
  data.settings.todayOverride = TODAY;
  data.lots.push(
    {
      id: 'old',
      productId: 'p1',
      lotNumber: 'LTOLD',
      expiryDate: '2026-11-01',
      receivedDate: '2026-01-01',
    },
    {
      id: 'soon',
      productId: 'p1',
      lotNumber: 'LT004512',
      expiryDate: '2026-11-22',
      receivedDate: '2026-02-01',
    },
  );
  const base = data.movements[0]!;
  data.movements.push(
    { ...base, id: 'm-old', lotId: 'old', quantity: 10 },
    { ...base, id: 'm-soon', lotId: 'soon', quantity: 12 },
  );
  return data;
}

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname}</p>;
}

function renderPage(path = '/salida?producto=p1') {
  render(
    <MemoryRouter initialEntries={['/inicio', path]} initialIndex={1}>
      <ToastProvider>
        <Routes>
          <Route path="/salida" element={<IssuePage />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

const issues = () => useInventoryStore.getState().data.movements.filter((m) => m.type === 'issue');
const balanceOf = (lotId: string) => {
  const { data } = useInventoryStore.getState();
  return lotBalance(
    data.lots.find((l) => l.id === lotId)!,
    data.movements,
  );
};

beforeAll(installDialogPolyfill);
beforeEach(() => {
  window.localStorage.clear();
  act(() => useInventoryStore.setState({ status: 'ready', data: dataset() }));
});

describe('IssuePage', () => {
  it('is a sheet with the product preselected and the usable stock as help', () => {
    renderPage();
    const dialog = screen.getByRole('dialog', { name: 'Registrar salida' });
    expect(within(dialog).getByLabelText('Producto')).toHaveValue('Glucosa');
    expect(within(dialog).getByLabelText('Concepto')).toHaveValue('Consumo');
    expect(screen.getByText('Disponible: 60 pruebas (no vencidas)')).toBeInTheDocument();
  });

  it('previews the lots live: first what expires first, then the next one', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(
      screen.queryByRole('region', { name: /Lotes de los que se descontará/ }),
    ).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Cantidad'), '16');
    const preview = screen.getByRole('region', { name: /Lotes de los que se descontará/ });
    const rows = within(preview)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(rows).toEqual([
      '12 de LT004512 · vence en 9 días',
      '4 de LT123456 · vence el 30 jun 2027',
    ]);
    // Never the expired lot.
    expect(preview).not.toHaveTextContent('LTOLD');
  });

  it('registers a FEFO issue split across lots, with a toast and "Deshacer"', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Cantidad'), '16');
    await user.click(screen.getByRole('button', { name: 'Registrar salida' }));

    expect(issues().map((m) => [m.lotId, m.quantity, m.concept])).toEqual([
      ['soon', 12, 'Consumo'],
      ['l1', 4, 'Consumo'],
    ]);
    expect(issues().every((m) => m.fefoOverrideReason === undefined)).toBe(true);
    expect(await screen.findByText('Salida registrada · Glucosa · 16 pruebas')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/inicio');

    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(issues()).toHaveLength(0);
    expect(balanceOf('soon')).toBe(12);
  });

  it('refuses more than the usable stock with a clear message', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Cantidad'), '61');
    await user.click(screen.getByRole('button', { name: 'Registrar salida' }));
    expect(screen.getByText('Solo hay 60 pruebas disponibles (no vencidas).')).toBeInTheDocument();
    expect(issues()).toHaveLength(0);
  });

  it('requires a product and a quantity', async () => {
    const user = userEvent.setup();
    renderPage('/salida');
    await user.click(screen.getByRole('button', { name: 'Registrar salida' }));
    expect(screen.getByText('Selecciona un producto.')).toBeInTheDocument();
    expect(
      screen.getByText('La cantidad debe ser un número entero mayor que 0.'),
    ).toBeInTheDocument();
  });

  it('converts boxes to units', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.selectOptions(screen.getByLabelText('Unidad de la cantidad'), 'package');
    await user.type(screen.getByLabelText('Cantidad'), '1');
    await user.click(screen.getByRole('button', { name: 'Registrar salida' }));
    expect(issues().reduce((sum, m) => sum + m.quantity, 0)).toBe(24);
  });

  describe('choosing a lot by hand', () => {
    it('another lot warns about the one that expires first and requires a reason', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.type(screen.getByLabelText('Cantidad'), '5');
      await user.click(screen.getByRole('button', { name: 'Elegir lote manualmente' }));
      expect(
        screen.queryByRole('region', { name: /Lotes de los que se descontará/ }),
      ).not.toBeInTheDocument();

      const lot = screen.getByLabelText('Lote');
      expect(within(lot).getByRole('option', { selected: true })).toHaveTextContent(
        'sugerido (FEFO)',
      );
      expect(screen.queryByLabelText('Motivo')).not.toBeInTheDocument();

      await user.selectOptions(lot, 'l1');
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Hay un lote que vence antes (LT004512, 9 días).',
      );
      await user.click(screen.getByRole('button', { name: 'Registrar salida' }));
      expect(screen.getByText('Indica el motivo de usar otro lote.')).toBeInTheDocument();
      expect(issues()).toHaveLength(0);

      await user.type(screen.getByLabelText('Motivo'), 'Lote abierto en el equipo');
      await user.click(screen.getByRole('button', { name: 'Registrar salida' }));
      expect(issues().map((m) => [m.lotId, m.quantity, m.fefoOverrideReason])).toEqual([
        ['l1', 5, 'Lote abierto en el equipo'],
      ]);
    });

    it('the FEFO lot chosen by hand needs no reason', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.type(screen.getByLabelText('Cantidad'), '5');
      await user.click(screen.getByRole('button', { name: 'Elegir lote manualmente' }));
      await user.click(screen.getByRole('button', { name: 'Registrar salida' }));
      expect(issues()).toHaveLength(1);
      expect(issues()[0]?.lotId).toBe('soon');
      expect(issues()[0]?.fefoOverrideReason).toBeUndefined();
    });

    it('limits the quantity to the chosen lot', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.type(screen.getByLabelText('Cantidad'), '13');
      await user.click(screen.getByRole('button', { name: 'Elegir lote manualmente' }));
      await user.click(screen.getByRole('button', { name: 'Registrar salida' }));
      expect(screen.getByText('Solo hay 12 pruebas en el lote LT004512.')).toBeInTheDocument();
    });

    it('never offers the expired lot', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole('button', { name: 'Elegir lote manualmente' }));
      const options = within(screen.getByLabelText('Lote')).getAllByRole('option');
      expect(options.map((o) => o.textContent)).not.toContainEqual(
        expect.stringContaining('LTOLD'),
      );
      expect(options).toHaveLength(2);
    });

    it('can go back to the FEFO suggestion', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole('button', { name: 'Elegir lote manualmente' }));
      await user.click(screen.getByRole('button', { name: 'Volver a la sugerencia FEFO' }));
      expect(screen.queryByLabelText('Lote')).not.toBeInTheDocument();
    });

    it('opens with the lot from the address already chosen', () => {
      renderPage('/salida?producto=p1&lote=l1');
      expect(screen.getByLabelText('Lote')).toHaveValue('l1');
      expect(screen.getByLabelText('Motivo')).toBeInTheDocument();
    });

    it('falls back to the FEFO lot if the lot in the address cannot be issued', () => {
      renderPage('/salida?producto=p1&lote=old');
      expect(screen.getByLabelText('Lote')).toHaveValue('soon');
    });
  });

  it('rejects a future date', async () => {
    const user = userEvent.setup();
    renderPage();
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-11-20' } });
    await user.type(screen.getByLabelText('Cantidad'), '1');
    await user.click(screen.getByRole('button', { name: 'Registrar salida' }));
    expect(screen.getByText('La fecha no puede ser futura.')).toBeInTheDocument();
  });

  it('Cancelar closes without issuing', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/inicio');
    expect(issues()).toHaveLength(0);
  });
});
