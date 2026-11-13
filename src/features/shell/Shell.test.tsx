import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { appRoutes } from '@/router';
import { useInventoryStore, type InventoryState } from '@/state/store';
import { installDialogPolyfill } from '@/test/dialog-polyfill';
import { sampleData } from '@/test/fixtures';

function renderApp(path = '/') {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

function setStore(partial: Partial<InventoryState>) {
  act(() => useInventoryStore.setState(partial));
}

beforeAll(installDialogPolyfill);

beforeEach(() => {
  window.localStorage.clear();
  setStore({ status: 'ready', loadError: undefined, saveError: undefined, data: sampleData() });
});

describe('Shell', () => {
  it('warns when saving failed and links to the backup, until a save succeeds', async () => {
    setStore({ saveError: 'No se pudo guardar: el almacenamiento del navegador está lleno.' });
    renderApp('/productos');
    await screen.findByRole('heading', { level: 1, name: 'Productos' });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/almacenamiento del navegador está lleno/);
    expect(
      within(alert).getByRole('link', { name: 'Descarga un respaldo en Ajustes' }),
    ).toHaveAttribute('href', '/ajustes');
    setStore({ saveError: undefined });
    await waitFor(() =>
      expect(screen.queryByText(/almacenamiento del navegador está lleno/)).not.toBeInTheDocument(),
    );
  });

  it('draws the frame with the lab name and the sections', async () => {
    renderApp('/productos');
    expect(await screen.findByRole('heading', { level: 1, name: 'Productos' })).toBeInTheDocument();
    const nav = screen.getAllByRole('navigation', { name: 'Secciones' })[0]!;
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Resumen', 'Productos', 'Vencimientos', 'Compras']);
    expect(screen.getAllByText('Laboratorio clínico').length).toBeGreaterThan(0);
  });

  it.each([
    ['/', 'Resumen'],
    ['/vencimientos', 'Vencimientos'],
    ['/compras', 'Compras'],
    ['/ajustes', 'Ajustes'],
    ['/entrada', 'Registrar entrada'],
    ['/salida', 'Registrar salida'],
    ['/productos/p1', 'Glucosa'],
  ])('routes %s to "%s"', async (path, title) => {
    renderApp(path);
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
  });

  it('warns when the date is simulated', async () => {
    setStore({
      data: {
        ...sampleData(),
        settings: { ...sampleData().settings, todayOverride: '2026-12-25' },
      },
    });
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Resumen' });
    expect(screen.getAllByText('Fecha simulada: 25 dic 2026').length).toBeGreaterThan(0);
  });

  it('shows the loading state', () => {
    setStore({ status: 'loading' });
    renderApp('/');
    expect(screen.getByRole('status')).toHaveTextContent('Cargando');
  });

  it('on a load error explains it and offers to reset, with confirmation', async () => {
    setStore({
      status: 'error',
      loadError: 'Los datos guardados en este navegador no se pueden leer.',
    });
    const user = userEvent.setup();
    renderApp('/');
    expect(await screen.findByText(/no se pueden leer/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Restablecer datos demo' }));
    await user.click(await screen.findByRole('button', { name: 'Restablecer' }));
    await waitFor(() => expect(useInventoryStore.getState().status).toBe('ready'));
    expect(useInventoryStore.getState().data.products.length).toBeGreaterThan(100);
  });
});

describe('Shell load error', () => {
  it('downloads the stored data as saved before resetting', async () => {
    window.localStorage.setItem('mi-lab:inventory:v1', '{"version":1,"areas":"roto"}');
    let saved: Blob | undefined;
    const createObjectURL = vi.fn((blob: Blob) => {
      saved = blob;
      return 'blob:datos';
    });
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      setStore({
        status: 'error',
        loadError: 'Los datos guardados en este navegador no se pueden leer.',
      });
      const user = userEvent.setup();
      renderApp('/');
      await user.click(await screen.findByRole('button', { name: 'Descargar datos guardados' }));
      await waitFor(() => expect(click).toHaveBeenCalledOnce());
      expect(await saved!.text()).toBe('{"version":1,"areas":"roto"}');
      expect(useInventoryStore.getState().status).toBe('error');
    } finally {
      click.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});

describe('global shortcuts', () => {
  it('N opens a new receipt and S a new issue', async () => {
    const user = userEvent.setup();
    const router = renderApp('/productos');
    await screen.findByRole('heading', { name: 'Productos' });
    await user.keyboard('n');
    expect(router.state.location.pathname).toBe('/entrada');
    await act(() => router.navigate('/productos'));
    await user.keyboard('s');
    expect(router.state.location.pathname).toBe('/salida');
  });

  it('keeps the product when used from its detail page', async () => {
    const user = userEvent.setup();
    const router = renderApp('/productos/p1');
    await screen.findByRole('heading', { name: 'Glucosa' });
    await user.keyboard('s');
    expect(router.state.location.pathname + router.state.location.search).toBe(
      '/salida?producto=p1',
    );
  });

  it('are ignored while typing in a field', async () => {
    const user = userEvent.setup();
    const router = renderApp('/ajustes');
    await screen.findByRole('heading', { name: 'Ajustes' });
    const field = document.body.appendChild(document.createElement('input'));
    field.focus();
    await user.keyboard('ns');
    expect(router.state.location.pathname).toBe('/ajustes');
    field.remove();
  });

  it('are ignored with a modifier key, and while a dialog is open', async () => {
    const user = userEvent.setup();
    const router = renderApp('/ajustes');
    await screen.findByRole('heading', { name: 'Ajustes' });
    await user.keyboard('{Control>}n{/Control}');
    expect(router.state.location.pathname).toBe('/ajustes');

    const dialog = document.body.appendChild(document.createElement('dialog'));
    dialog.setAttribute('open', '');
    await user.keyboard('n');
    expect(router.state.location.pathname).toBe('/ajustes');
    dialog.remove();
  });

  it('Ctrl+K and "/" go to the product search', async () => {
    const user = userEvent.setup();
    const router = renderApp('/ajustes');
    await screen.findByRole('heading', { name: 'Ajustes' });
    await user.keyboard('{Control>}k{/Control}');
    expect(router.state.location.pathname).toBe('/productos');
    expect(router.state.location.state).toEqual({ focusSearch: true });

    await act(() => router.navigate('/ajustes'));
    await user.keyboard('/');
    expect(router.state.location.pathname).toBe('/productos');
  });
});
