import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InventoryData } from '@/domain/types';
import { useInventoryStore } from '@/state/store';
import { sampleData } from '@/test/fixtures';
import { ToastProvider } from '@/ui';
import { ReportsPage } from './ReportsPage';

const mocks = vi.hoisted(() => ({ build: vi.fn() }));
vi.mock('@/lib/xlsx/buildWorkbook', () => ({
  buildReportWorkbook: mocks.build,
  reportFileName: (from: string, to: string) => `mi-lab-informe-${from}_${to}.xlsx`,
}));

const TODAY = '2026-11-13';

function setup(data?: InventoryData) {
  const base = data ?? sampleData();
  act(() =>
    useInventoryStore.setState({
      status: 'ready',
      loadError: undefined,
      data: { ...base, settings: { ...base.settings, todayOverride: TODAY } },
    }),
  );
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ReportsPage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

function withMovements(): InventoryData {
  const base = sampleData();
  const product = base.products[0]!;
  return {
    ...base,
    lots: [
      {
        id: 'lt',
        productId: product.id,
        lotNumber: 'LT1',
        expiryDate: '2027-12-31',
        receivedDate: '2026-11-02',
      },
    ],
    movements: [
      {
        id: 'm1',
        type: 'receipt',
        date: '2026-11-02',
        productId: product.id,
        lotId: 'lt',
        quantity: 100,
        concept: 'Compra',
        createdAt: '2026-11-02T08:00:00.000Z',
      },
    ],
  };
}

const downloadButton = () => screen.getByRole('button', { name: /Descargar informe|Generando/ });

beforeEach(() => {
  mocks.build.mockReset();
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe('ReportsPage', () => {
  it('shows the current month range and an empty notice without movements', () => {
    setup();
    expect(screen.getByText(/Del 1 nov 2026 al 13 nov 2026/)).toBeInTheDocument();
    expect(screen.getByText('Sin movimientos en este periodo')).toBeInTheDocument();
  });

  it('updates the summary when the period changes', async () => {
    const user = userEvent.setup();
    setup(withMovements());
    expect(screen.getByText('Movimientos')).toBeInTheDocument();
    expect(screen.getByText('Entradas').closest('div')).toHaveTextContent('100 unidades');
    await user.click(screen.getByRole('radio', { name: 'Mes anterior' }));
    expect(screen.getByText(/Del 1 oct 2026 al 31 oct 2026/)).toBeInTheDocument();
    expect(screen.getByText('Sin movimientos en este periodo')).toBeInTheDocument();
  });

  it('rejects an inverted range and disables the download', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('radio', { name: 'Rango' }));
    const fromField = screen.getByLabelText('Desde');
    await user.clear(fromField);
    await user.type(fromField, '2026-11-20');
    expect(screen.getByRole('alert')).toHaveTextContent('“Desde” no puede ser posterior a “Hasta”');
    expect(downloadButton()).toBeDisabled();
    expect(screen.queryByText('Vista previa')).not.toBeInTheDocument();
  });

  it('downloads the generated file and revokes the object URL', async () => {
    const user = userEvent.setup();
    mocks.build.mockResolvedValue(new Uint8Array([1, 2, 3]));
    setup(withMovements());
    await user.click(downloadButton());
    expect(mocks.build).toHaveBeenCalledTimes(1);
    expect(mocks.build.mock.calls[0]![0].period.from).toBe('2026-11-01');
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x'));
    expect(
      await screen.findByText('Informe descargado · mi-lab-informe-2026-11-01_2026-11-13.xlsx'),
    ).toBeInTheDocument();
  });

  it('shows a recoverable alert when generation fails', async () => {
    const user = userEvent.setup();
    mocks.build.mockRejectedValueOnce(new Error('boom'));
    setup(withMovements());
    await user.click(downloadButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo generar el informe');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    mocks.build.mockResolvedValue(new Uint8Array([1]));
    await user.click(downloadButton());
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});
