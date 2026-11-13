import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { appRoutes } from '@/router';
import { useInventoryStore } from '@/state/store';
import { installDialogPolyfill } from '@/test/dialog-polyfill';
import { sampleData } from '@/test/fixtures';

/*
 * Accessibility of the app as a whole (T7.2): page titles, route announcements, where the focus
 * goes, and the keyboard paths of PLAN §8.3 from start to finish.
 */

function renderApp(path = '/') {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

const announcer = () =>
  document.querySelector<HTMLElement>('p[aria-live="polite"][aria-atomic="true"]');

beforeAll(installDialogPolyfill);

beforeEach(() => {
  window.localStorage.clear();
  act(() =>
    useInventoryStore.setState({ status: 'ready', loadError: undefined, data: sampleData() }),
  );
});

describe('page titles', () => {
  it.each([
    ['/', 'Resumen · Mi-lab'],
    ['/productos', 'Productos · Mi-lab'],
    ['/productos/p1', 'Glucosa · Mi-lab'],
    ['/productos/no-existe', 'Producto no encontrado · Mi-lab'],
    ['/vencimientos', 'Vencimientos · Mi-lab'],
    ['/compras', 'Compras · Mi-lab'],
    ['/entrada', 'Registrar entrada · Mi-lab'],
    ['/salida', 'Registrar salida · Mi-lab'],
    ['/ajustes', 'Ajustes · Mi-lab'],
    ['/no-existe', 'Página no encontrada · Mi-lab'],
  ])('%s is titled "%s"', async (path, title) => {
    renderApp(path);
    await waitFor(() => expect(document.title).toBe(title));
  });

  it('an unknown address explains itself and leads back home', async () => {
    const user = userEvent.setup();
    const router = renderApp('/no-existe');
    await user.click(await screen.findByRole('button', { name: 'Ir al Resumen' }));
    expect(router.state.location.pathname).toBe('/');
  });
});

describe('route announcements', () => {
  it('stays silent on the first load and announces the page after a navigation', async () => {
    const router = renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Resumen' });
    expect(announcer()).toHaveTextContent('');
    await act(() => router.navigate('/compras'));
    await waitFor(() => expect(announcer()).toHaveTextContent('Compras · Mi-lab'));
  });
});

describe('keyboard, end to end', () => {
  it('N opens the receipt sheet with focus inside; closing it returns focus to the page', async () => {
    const user = userEvent.setup();
    const router = renderApp('/productos');
    await screen.findByRole('heading', { level: 1, name: 'Productos' });

    await user.keyboard('n');
    const dialog = await screen.findByRole('dialog', { name: 'Registrar entrada' });
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));

    await user.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/productos'));
    await screen.findByRole('heading', { level: 1, name: 'Productos' });
    // The opener was unmounted with the old page: focus lands on <main>, not on <body>.
    await waitFor(() => expect(document.getElementById('main')).toHaveFocus());
    await waitFor(() => expect(announcer()).toHaveTextContent('Productos · Mi-lab'));
  });

  it('Esc closes the issue sheet opened with S', async () => {
    const user = userEvent.setup();
    const router = renderApp('/vencimientos');
    await screen.findByRole('heading', { level: 1, name: 'Vencimientos' });
    await user.keyboard('s');
    const dialog = await screen.findByRole('dialog', { name: 'Registrar salida' });
    // jsdom does not turn Esc into the dialog `cancel` event; the browser does.
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/vencimientos'));
  });

  it('⌘K from any page lands in the product search field', async () => {
    const user = userEvent.setup();
    renderApp('/compras');
    await screen.findByRole('heading', { level: 1, name: 'Compras' });
    await user.keyboard('{Meta>}k{/Meta}');
    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveFocus());
  });

  it('"/" on the products page focuses the search field in place', async () => {
    const user = userEvent.setup();
    renderApp('/productos');
    await screen.findByRole('heading', { level: 1, name: 'Productos' });
    await user.keyboard('/');
    expect(screen.getByRole('searchbox')).toHaveFocus();
  });

  it('the skip link targets the focusable main region', async () => {
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Resumen' });
    const skip = screen.getByRole('link', { name: 'Saltar al contenido' });
    expect(skip).toHaveAttribute('href', '#main');
    expect(document.getElementById('main')).toHaveAttribute('tabindex', '-1');
  });

  it('the Entrada and Salida buttons expose their shortcuts', async () => {
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Resumen' });
    expect(screen.getByRole('button', { name: 'Entrada' })).toHaveAttribute(
      'aria-keyshortcuts',
      'N',
    );
    expect(screen.getByRole('button', { name: 'Salida' })).toHaveAttribute(
      'aria-keyshortcuts',
      'S',
    );
  });
});
