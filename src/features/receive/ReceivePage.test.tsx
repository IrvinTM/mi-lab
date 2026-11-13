import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { lotBalance } from '@/domain/stock';
import { useInventoryStore } from '@/state/store';
import { ToastProvider } from '@/ui';
import { installDialogPolyfill } from '@/test/dialog-polyfill';
import { sampleData } from '@/test/fixtures';
import { ReceivePage } from './ReceivePage';

const TODAY = '2026-11-13';

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname}</p>;
}

function renderPage(path = '/entrada?producto=p1') {
  render(
    <MemoryRouter initialEntries={['/inicio', path]} initialIndex={1}>
      <ToastProvider>
        <Routes>
          <Route path="/entrada" element={<ReceivePage />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

const receipts = () =>
  useInventoryStore.getState().data.movements.filter((m) => m.type === 'receipt');
const setDate = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeAll(installDialogPolyfill);
beforeEach(() => {
  window.localStorage.clear();
  const data = sampleData();
  data.settings.todayOverride = TODAY;
  act(() => useInventoryStore.setState({ status: 'ready', data }));
});

describe('ReceivePage', () => {
  it('is a sheet titled "Registrar entrada" with the product from the address preselected', () => {
    renderPage();
    const dialog = screen.getByRole('dialog', { name: 'Registrar entrada' });
    expect(within(dialog).getByLabelText('Producto')).toHaveValue('Glucosa');
    expect(within(dialog).getByLabelText('Fecha')).toHaveValue(TODAY);
    expect(within(dialog).getByLabelText('Concepto')).toHaveValue('Compra');
  });

  it('records a receipt, shows the toast and closes the sheet', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Nº de lote'), 'lt555001');
    setDate('Vencimiento', '2027-09-01');
    await user.type(screen.getByLabelText('Cantidad'), '48');
    await user.type(screen.getByLabelText(/Precio unitario/), '2,5');
    await user.selectOptions(screen.getByLabelText('Procedencia'), '1');
    await user.click(screen.getByRole('button', { name: 'Registrar entrada' }));

    const { data } = useInventoryStore.getState();
    const lot = data.lots.find((l) => l.lotNumber === 'LT555001')!;
    expect(lot).toMatchObject({
      expiryDate: '2027-09-01',
      receivedDate: TODAY,
      sourceCode: 1,
      unitPrice: 2.5,
    });
    expect(lotBalance(lot, data.movements)).toBe(48);
    expect(
      await screen.findByText('Entrada registrada · Glucosa · Lote LT555001 · 48 pruebas'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/inicio');
  });

  it('"Deshacer" removes the receipt and the lot it created', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Nº de lote'), 'LT555002');
    setDate('Vencimiento', '2027-09-01');
    await user.type(screen.getByLabelText('Cantidad'), '10');
    await user.click(screen.getByRole('button', { name: 'Registrar entrada' }));
    await user.click(await screen.findByRole('button', { name: 'Deshacer' }));

    const { data } = useInventoryStore.getState();
    expect(data.lots.some((l) => l.lotNumber === 'LT555002')).toBe(false);
    expect(await screen.findByText('Entrada deshecha.')).toBeInTheDocument();
  });

  it('shows what is missing when submitting an empty form, and saves nothing', async () => {
    const user = userEvent.setup();
    renderPage('/entrada');
    const before = receipts().length;
    await user.click(screen.getByRole('button', { name: 'Registrar entrada' }));
    expect(screen.getByText('Selecciona un producto.')).toBeInTheDocument();
    expect(screen.getByText('Ingresa el número de lote.')).toBeInTheDocument();
    expect(screen.getByText('Ingresa la fecha de vencimiento.')).toBeInTheDocument();
    expect(
      screen.getByText('La cantidad debe ser un número entero mayor que 0.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Nº de lote')).toHaveAttribute('aria-invalid', 'true');
    expect(receipts()).toHaveLength(before);
  });

  it('rejects the same lot number with a different expiry date', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Nº de lote'), 'lt123456');
    setDate('Vencimiento', '2027-07-01');
    await user.type(screen.getByLabelText('Cantidad'), '5');
    await user.click(screen.getByRole('button', { name: 'Registrar entrada' }));
    expect(
      screen.getByText('El lote LT123456 ya existe con vencimiento distinto.'),
    ).toBeInTheDocument();
  });

  it('adds to an existing lot when the expiry matches', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Nº de lote'), 'lt123456');
    setDate('Vencimiento', '2027-06-30');
    await user.type(screen.getByLabelText('Cantidad'), '12');
    await user.click(screen.getByRole('button', { name: 'Registrar entrada' }));
    const { data } = useInventoryStore.getState();
    expect(data.lots).toHaveLength(1);
    expect(lotBalance(data.lots[0]!, data.movements)).toBe(60);
  });

  it('converts boxes to base units and shows the result', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.selectOptions(screen.getByLabelText('Unidad de la cantidad'), 'package');
    await user.type(screen.getByLabelText('Cantidad'), '2');
    expect(screen.getByText('= 48 pruebas')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Nº de lote'), 'LT555003');
    setDate('Vencimiento', '2027-09-01');
    await user.click(screen.getByRole('button', { name: 'Registrar entrada' }));
    expect(receipts().at(-1)?.quantity).toBe(48);
  });

  it('needs a second, explicit click when the lot expires soon', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Nº de lote'), 'LT555004');
    setDate('Vencimiento', '2026-12-01');
    await user.type(screen.getByLabelText('Cantidad'), '5');
    const before = receipts().length;

    await user.click(screen.getByRole('button', { name: 'Registrar entrada' }));
    expect(screen.getByRole('alert')).toHaveTextContent('vence en 18 días');
    expect(receipts()).toHaveLength(before);

    await user.click(screen.getByRole('button', { name: 'Registrar de todos modos' }));
    expect(receipts()).toHaveLength(before + 1);
  });

  it('notes that the new lot will be used first when it expires before the stock', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Nº de lote'), 'LT555005');
    setDate('Vencimiento', '2027-03-01'); // existing lot expires 2027-06-30
    expect(
      screen.getByText('Este lote vence antes que los que ya tienes; se usará primero.'),
    ).toBeInTheDocument();
    setDate('Vencimiento', '2027-12-01');
    expect(screen.queryByText(/vence antes que los que ya tienes/)).not.toBeInTheDocument();
  });

  it('finds the product by typing its name, ignoring case and accents', async () => {
    const user = userEvent.setup();
    renderPage('/entrada');
    const field = screen.getByLabelText('Producto');
    await user.type(field, 'GLUCOSA');
    await user.type(screen.getByLabelText('Nº de lote'), 'LT555006');
    setDate('Vencimiento', '2027-09-01');
    await user.type(screen.getByLabelText('Cantidad'), '1');
    await user.click(screen.getByRole('button', { name: 'Registrar entrada' }));
    expect(receipts().at(-1)?.productId).toBe('p1');
  });

  it('does not accept a quantity of 0 or a negative price', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Nº de lote'), 'LT555007');
    setDate('Vencimiento', '2027-09-01');
    await user.type(screen.getByLabelText('Cantidad'), '0');
    await user.type(screen.getByLabelText(/Precio unitario/), 'abc');
    await user.click(screen.getByRole('button', { name: 'Registrar entrada' }));
    expect(
      screen.getByText('La cantidad debe ser un número entero mayor que 0.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Ingresa un precio válido, por ejemplo 2.50.')).toBeInTheDocument();
  });

  it('Cancelar closes without saving', async () => {
    const user = userEvent.setup();
    renderPage();
    const before = receipts().length;
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/inicio');
    expect(receipts()).toHaveLength(before);
  });
});
