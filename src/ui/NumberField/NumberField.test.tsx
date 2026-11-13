import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NumberField } from './NumberField';

function Controlled({
  initial = null,
  onValue,
  ...rest
}: {
  initial?: number | null;
  onValue?: (value: number | null) => void;
  allowNegative?: boolean;
  error?: string;
}) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <NumberField
      label="Cantidad"
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
      {...rest}
    />
  );
}

describe('NumberField', () => {
  it('has a label and a numeric keypad', () => {
    render(<Controlled />);
    const input = screen.getByLabelText('Cantidad');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).toHaveValue('');
  });

  it('shows the initial number', () => {
    render(<Controlled initial={48} />);
    expect(screen.getByLabelText('Cantidad')).toHaveValue('48');
  });

  it('reports integers and null when emptied', async () => {
    const onValue = vi.fn();
    render(<Controlled onValue={onValue} />);
    const input = screen.getByLabelText('Cantidad');
    await userEvent.type(input, '24');
    expect(onValue).toHaveBeenLastCalledWith(24);
    await userEvent.clear(input);
    expect(onValue).toHaveBeenLastCalledWith(null);
  });

  it('drops anything that is not a digit', async () => {
    const onValue = vi.fn();
    render(<Controlled onValue={onValue} />);
    const input = screen.getByLabelText('Cantidad');
    await userEvent.type(input, '1.5e-3');
    expect(input).toHaveValue('153');
    await userEvent.clear(input);
    await userEvent.click(input);
    await userEvent.paste('1,200');
    expect(input).toHaveValue('1200');
    expect(onValue).toHaveBeenLastCalledWith(1200);
  });

  it('rejects a minus sign unless negatives are allowed', async () => {
    const { unmount } = render(<Controlled />);
    await userEvent.type(screen.getByLabelText('Cantidad'), '-5');
    expect(screen.getByLabelText('Cantidad')).toHaveValue('5');
    unmount();

    const onValue = vi.fn();
    render(<Controlled allowNegative onValue={onValue} />);
    const input = screen.getByLabelText('Cantidad');
    await userEvent.type(input, '-');
    expect(input).toHaveValue('-');
    expect(onValue).toHaveBeenLastCalledWith(null);
    await userEvent.type(input, '5');
    expect(onValue).toHaveBeenLastCalledWith(-5);
  });

  it('normalizes leading zeros on blur', async () => {
    render(<Controlled />);
    const input = screen.getByLabelText('Cantidad');
    await userEvent.type(input, '007');
    expect(input).toHaveValue('007');
    await userEvent.tab();
    expect(input).toHaveValue('7');
  });

  it('follows the value when the parent changes it', () => {
    const { rerender } = render(<NumberField label="Cantidad" value={5} />);
    expect(screen.getByLabelText('Cantidad')).toHaveValue('5');
    rerender(<NumberField label="Cantidad" value={null} />);
    expect(screen.getByLabelText('Cantidad')).toHaveValue('');
    rerender(<NumberField label="Cantidad" value={12} />);
    expect(screen.getByLabelText('Cantidad')).toHaveValue('12');
  });

  it('exposes the error accessibly', () => {
    render(<Controlled error="Debe ser mayor que cero" />);
    const input = screen.getByLabelText('Cantidad');
    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription('Debe ser mayor que cero');
  });
});
