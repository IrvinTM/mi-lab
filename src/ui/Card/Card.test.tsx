import { render, screen } from '@testing-library/react';
import { Card } from './Card';

describe('Card', () => {
  it('renders children on an elevated surface', () => {
    render(<Card data-testid="card">Contenido</Card>);
    expect(screen.getByTestId('card')).toHaveTextContent('Contenido');
    expect(screen.getByTestId('card')).toHaveClass('bg-bg-elevated', 'p-4');
  });

  it('renders as a named region when it is a section', () => {
    render(
      <Card as="section" aria-label="Usar primero" padding="none">
        x
      </Card>,
    );
    expect(screen.getByRole('region', { name: 'Usar primero' })).not.toHaveClass('p-4');
  });
});
