import { render, screen } from '@testing-library/react';
import { CircleCheck, Clock, TriangleAlert } from 'lucide-react';
import { Badge, type BadgeTone } from './Badge';

describe('Badge', () => {
  it('renders text with a decorative icon', () => {
    const { container } = render(
      <Badge tone="green" icon={CircleCheck}>
        Vence el 12 mar 2027
      </Badge>,
    );
    expect(screen.getByText('Vence el 12 mar 2027')).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it.each<BadgeTone>(['red', 'orange', 'yellow', 'green', 'teal', 'gray'])(
    'uses a 15 %% tint and label-colored text for %s',
    (tone) => {
      render(
        <Badge tone={tone} icon={Clock}>
          Estado
        </Badge>,
      );
      const badge = screen.getByText('Estado');
      expect(badge).toHaveClass(`bg-${tone}/15`, 'text-label');
      expect(badge.className).not.toContain(`text-${tone}`);
    },
  );

  it('keeps yellow and orange icons dark too', () => {
    const { container } = render(
      <Badge tone="orange" icon={TriangleAlert}>
        Vence en 9 días
      </Badge>,
    );
    expect(container.querySelector('svg')).toHaveClass('text-label');
  });
});
