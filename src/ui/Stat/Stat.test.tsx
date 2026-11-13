import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Link } from 'react-router';
import { Stat } from './Stat';

describe('Stat', () => {
  it('renders label, value and detail as static content', () => {
    render(<Stat label="Por vencer" value="12" detail="340 pruebas" />);
    expect(screen.getByText('Por vencer')).toBeInTheDocument();
    expect(screen.getByText('12')).toHaveClass('tabular-nums');
    expect(screen.getByText('340 pruebas')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders a link when given href', () => {
    render(<Stat href="/vencimientos" label="Vencidos" value="3" />);
    expect(screen.getByRole('link', { name: /Vencidos/ })).toHaveAttribute('href', '/vencimientos');
  });

  it('renders a button when given onClick', async () => {
    const onClick = vi.fn();
    render(<Stat onClick={onClick} label="Por comprar" value="5" />);
    await userEvent.click(screen.getByRole('button', { name: /Por comprar/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('can render a router Link through `as`', () => {
    render(
      <MemoryRouter>
        <Stat as={Link} to="/compras" label="Por comprar" value="5" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /Por comprar/ })).toHaveAttribute('href', '/compras');
  });

  it('shows a dash value as given', () => {
    render(<Stat label="Cobertura" value="—" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
