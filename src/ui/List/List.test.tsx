import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { List, ListRow } from './List';

describe('List', () => {
  it('renders a list named by its header with rows and footer', () => {
    render(
      <List header="Vencen pronto" footer="Ordenado por vencimiento">
        <ListRow title="Glucosa" subtitle="Química seca" trailing="48" />
        <ListRow title="Urea" />
      </List>,
    );
    const list = screen.getByRole('list', { name: 'Vencen pronto' });
    expect(list).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Química seca')).toBeInTheDocument();
    expect(screen.getByText('48')).toBeInTheDocument();
    expect(screen.getByText('Ordenado por vencimiento')).toBeInTheDocument();
  });

  it('uses aria-label when there is no header', () => {
    render(
      <List aria-label="Productos">
        <ListRow title="Glucosa" />
      </List>,
    );
    expect(screen.getByRole('list', { name: 'Productos' })).toBeInTheDocument();
  });

  it('renders a plain row without interactive roles', () => {
    render(
      <List aria-label="Productos">
        <ListRow title="Glucosa" />
      </List>,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders a link row with href', () => {
    render(
      <List aria-label="Productos">
        <ListRow title="Glucosa" href="/productos/1" chevron />
      </List>,
    );
    expect(screen.getByRole('link', { name: 'Glucosa' })).toHaveAttribute('href', '/productos/1');
  });

  it('renders a button row that responds to click, Enter and Space', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <List aria-label="Productos">
        <ListRow title="Glucosa" onClick={onClick} chevron />
      </List>,
    );
    await user.click(screen.getByRole('button', { name: 'Glucosa' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Glucosa' })).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('hides the chevron from assistive tech', () => {
    const { container } = render(
      <List aria-label="Productos">
        <ListRow title="Glucosa" onClick={() => {}} chevron />
      </List>,
    );
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
