import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SegmentedControl, type SegmentedOption } from './SegmentedControl';

const options: SegmentedOption<string>[] = [
  { value: 'all', label: 'Todas' },
  { value: 'dry', label: 'Química seca' },
  { value: 'wet', label: 'Química húmeda' },
];

function Harness({ initial = 'all' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <SegmentedControl label="Área" options={options} value={value} onChange={setValue} />
      <output>{value}</output>
    </>
  );
}

describe('SegmentedControl', () => {
  it('renders a named radiogroup with the selected radio checked', () => {
    render(<Harness initial="dry" />);
    expect(screen.getByRole('radiogroup', { name: 'Área' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'Química seca' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Todas' })).not.toBeChecked();
  });

  it('uses a roving tabindex on the selected segment', () => {
    render(<Harness initial="dry" />);
    expect(screen.getByRole('radio', { name: 'Química seca' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Todas' })).toHaveAttribute('tabindex', '-1');
  });

  it('selects on click', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('radio', { name: 'Química húmeda' }));
    expect(screen.getByRole('radio', { name: 'Química húmeda' })).toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent('wet');
  });

  it('moves and selects with arrow keys, wrapping around', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.tab();
    expect(screen.getByRole('radio', { name: 'Todas' })).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Química seca' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Química seca' })).toBeChecked();

    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(screen.getByRole('radio', { name: 'Todas' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Todas' })).toBeChecked();

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'Química húmeda' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Química húmeda' })).toBeChecked();
  });

  it('jumps with Home and End', async () => {
    const user = userEvent.setup();
    render(<Harness initial="dry" />);
    await user.tab();
    await user.keyboard('{End}');
    expect(screen.getByRole('status')).toHaveTextContent('wet');
    await user.keyboard('{Home}');
    expect(screen.getByRole('status')).toHaveTextContent('all');
  });

  it('keeps the first segment tabbable when the value matches no option', () => {
    render(<Harness initial="none" />);
    expect(screen.getByRole('radio', { name: 'Todas' })).toHaveAttribute('tabindex', '0');
  });
});
