import { render, screen } from '@testing-library/react';
import { ExpiryBadge, ReorderBadge } from './StatusBadges';

describe('ExpiryBadge', () => {
  it.each([
    ['expired', -4, '2026-11-09', 'Vencido hace 4 días'],
    ['critical', 9, '2026-11-22', 'Vence en 9 días'],
    ['warning', 45, '2026-12-28', 'Vence en 45 días'],
    ['ok', 485, '2027-03-12', 'Vence el 12 mar 2027'],
  ] as const)('%s → "%s"', (status, daysLeft, expiryDate, text) => {
    render(<ExpiryBadge status={status} daysLeft={daysLeft} expiryDate={expiryDate} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});

describe('ReorderBadge', () => {
  const base = { stockForDecision: 0 };

  it('says how much to buy, in boxes when the package size is known', () => {
    render(
      <ReorderBadge
        reorder={{ ...base, status: 'reorder', suggestedQty: 72, suggestedPackages: 3 }}
        unit="prueba"
      />,
    );
    expect(screen.getByText('Comprar 3 cajas')).toBeInTheDocument();
  });

  it('falls back to base units without a package size', () => {
    render(
      <ReorderBadge reorder={{ ...base, status: 'reorder', suggestedQty: 40 }} unit="frasco" />,
    );
    expect(screen.getByText('Comprar 40 frascos')).toBeInTheDocument();
  });

  it('plain "Comprar" without a suggestion', () => {
    render(<ReorderBadge reorder={{ ...base, status: 'reorder' }} unit="prueba" />);
    expect(screen.getByText('Comprar')).toBeInTheDocument();
  });

  it.each([
    ['out', 'Agotado'],
    ['excess', 'Sobre el máximo'],
    ['unknown', 'Configura el consumo'],
    ['ok', 'Stock suficiente'],
  ] as const)('%s → "%s"', (status, text) => {
    render(<ReorderBadge reorder={{ ...base, status }} unit="prueba" />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});
