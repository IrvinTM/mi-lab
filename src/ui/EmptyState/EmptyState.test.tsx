import { render, screen } from '@testing-library/react';
import { PackageX } from 'lucide-react';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('shows the title, the explanation and the action', () => {
    render(
      <EmptyState icon={PackageX} title="Sin productos" action={<button>Agregar</button>}>
        No hay productos que coincidan con la búsqueda.
      </EmptyState>,
    );
    expect(screen.getByRole('heading', { name: 'Sin productos' })).toBeInTheDocument();
    expect(screen.getByText('No hay productos que coincidan con la búsqueda.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar' })).toBeInTheDocument();
  });

  it('hides the decorative icon from assistive technology and works without text or action', () => {
    const { container } = render(<EmptyState icon={PackageX} title="Nada por aquí" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
