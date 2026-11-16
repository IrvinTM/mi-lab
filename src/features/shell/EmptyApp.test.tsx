import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { DEFAULT_SETTINGS } from '@/data/migrate';
import { appRoutes } from '@/router';
import { useInventoryStore } from '@/state/store';
import { installDialogPolyfill } from '@/test/dialog-polyfill';

function renderApp(path: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeAll(installDialogPolyfill);

beforeEach(() => {
  window.localStorage.clear();
  act(() =>
    useInventoryStore.setState({
      status: 'ready',
      loadError: undefined,
      saveError: undefined,
      data: {
        version: 1,
        areas: [],
        fundingSources: [],
        products: [],
        lots: [],
        movements: [],
        settings: { ...DEFAULT_SETTINGS },
      },
    }),
  );
});

const PAGES: [string, string][] = [
  ['/', 'Resumen'],
  ['/productos', 'Productos'],
  ['/vencimientos', 'Vencimientos'],
  ['/compras', 'Compras'],
  ['/informes', 'Informes'],
];

describe('a freshly installed (empty) app', () => {
  it.each(PAGES)('%s renders the setup guide with no NaN or errors', async (path, title) => {
    renderApp(path);
    await screen.findByRole('heading', { level: 1, name: title });
    expect(await screen.findByText(/Empieza creando un área en Ajustes/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ir a Ajustes' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Nuevo producto' }).length).toBeGreaterThan(0);
    expect(document.body).not.toHaveTextContent(/NaN|Infinity|undefined/);
  });

  it('the dashboard recommends importing a backup', async () => {
    renderApp('/');
    const link = await screen.findByRole('link', { name: 'Ajustes → Respaldo' });
    expect(link).toHaveAttribute('href', '/ajustes');
  });

  it('"Ir a Ajustes" opens the settings', async () => {
    const user = userEvent.setup();
    const router = renderApp('/compras');
    await user.click(await screen.findByRole('button', { name: 'Ir a Ajustes' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/ajustes'));
  });

  it('"Nuevo producto" opens the new product sheet on Productos', async () => {
    const user = userEvent.setup();
    const router = renderApp('/vencimientos');
    await user.click(await screen.findByRole('button', { name: 'Nuevo producto' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/productos'));
    expect(
      await screen.findByRole('dialog', { name: 'Nuevo producto' }, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  it.each([
    ['/entrada', 'Registrar entrada'],
    ['/salida', 'Registrar salida'],
  ])('%s says there are no products and links to creating one', async (path, title) => {
    const user = userEvent.setup();
    const router = renderApp(path);
    expect(await screen.findByRole('dialog', { name: title })).toBeInTheDocument();
    expect(screen.getByText(/Aún no hay productos/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Crear un producto' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/productos'));
    expect(
      await screen.findByRole('dialog', { name: 'Nuevo producto' }, { timeout: 3000 }),
    ).toBeInTheDocument();
  });
});
