import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Boxes, Settings, ShoppingCart } from 'lucide-react';
import { MemoryRouter, useLocation } from 'react-router';
import { Sidebar } from '../Sidebar';
import { TabBar } from '../TabBar';
import { AppShell } from './AppShell';
import { PageHeader } from './PageHeader';

const items = [
  { to: '/', label: 'Resumen', icon: Boxes, end: true },
  { to: '/productos', label: 'Productos', icon: Boxes },
  { to: '/compras', label: 'Compras', icon: ShoppingCart },
];
const settings = { to: '/ajustes', label: 'Ajustes', icon: Settings };

function Location() {
  return <p data-testid="location">{useLocation().pathname}</p>;
}

function renderAt(path: string, ui: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      {ui}
      <Location />
    </MemoryRouter>,
  );
}

describe('Sidebar', () => {
  it('lists the sections and settings as links, marking the current one', () => {
    renderAt(
      '/productos',
      <Sidebar title="Laboratorio Clínico" items={items} footerItems={[settings]} />,
    );
    expect(screen.getByText('Laboratorio Clínico')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Productos' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Resumen' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Ajustes' })).toHaveAttribute('href', '/ajustes');
  });

  it('only marks the root as current on "/" (end matching)', () => {
    renderAt('/', <Sidebar title="Lab" items={items} />);
    expect(screen.getByRole('link', { name: 'Resumen' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Productos' })).not.toHaveAttribute('aria-current');
  });

  it('shows the notice', () => {
    renderAt(
      '/',
      <Sidebar title="Lab" items={items} notice={<p>Fecha simulada: 13 nov 2026</p>} />,
    );
    expect(screen.getByText('Fecha simulada: 13 nov 2026')).toBeInTheDocument();
  });

  it('navigates with the keyboard', async () => {
    const user = userEvent.setup();
    renderAt('/', <Sidebar title="Lab" items={items} />);
    await user.tab();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Productos' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('location')).toHaveTextContent('/productos');
  });
});

describe('TabBar', () => {
  it('shows a text label for every tab and marks the current one', () => {
    renderAt('/compras', <TabBar items={items} />);
    const nav = screen.getByRole('navigation', { name: 'Secciones' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Resumen', 'Productos', 'Compras']);
    expect(within(nav).getByRole('link', { name: 'Compras' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

describe('AppShell', () => {
  it('renders the page inside a main landmark with a skip link', () => {
    renderAt(
      '/',
      <AppShell title="Lab" items={items} settings={settings}>
        <PageHeader title="Resumen" actions={<button>+ Entrada</button>} />
      </AppShell>,
    );
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main');
    expect(within(main).getByRole('heading', { level: 1, name: 'Resumen' })).toBeInTheDocument();
    expect(within(main).getByRole('button', { name: '+ Entrada' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Saltar al contenido' })).toHaveAttribute(
      'href',
      '#main',
    );
  });

  it('has both navigations (sidebar and tab bar; CSS shows one) and a settings link', () => {
    renderAt(
      '/',
      <AppShell title="Lab" items={items} settings={settings}>
        x
      </AppShell>,
    );
    expect(screen.getAllByRole('navigation', { name: 'Secciones' })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Ajustes' }).length).toBeGreaterThanOrEqual(2);
  });

  it('shows the notice', () => {
    renderAt(
      '/',
      <AppShell title="Lab" items={items} notice={<p>Fecha simulada</p>}>
        x
      </AppShell>,
    );
    expect(screen.getAllByText('Fecha simulada').length).toBeGreaterThanOrEqual(1);
  });
});
