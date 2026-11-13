import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { DateField } from './DateField';

function Controlled({ onValue, error }: { onValue?: (v: string) => void; error?: string }) {
  const [value, setValue] = useState('');
  return (
    <DateField
      label="Fecha de vencimiento"
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
      error={error}
      help="Día/mes/año impreso en la caja"
    />
  );
}

describe('DateField', () => {
  it('renders a labelled native date input', () => {
    render(<Controlled />);
    const input = screen.getByLabelText('Fecha de vencimiento');
    expect(input).toHaveAttribute('type', 'date');
    expect(input).toHaveAccessibleDescription('Día/mes/año impreso en la caja');
  });

  it('passes the YYYY-MM-DD string through untouched', () => {
    const onValue = vi.fn();
    render(<Controlled onValue={onValue} />);
    const input = screen.getByLabelText('Fecha de vencimiento');
    fireEvent.change(input, { target: { value: '2027-03-12' } });
    expect(onValue).toHaveBeenCalledWith('2027-03-12');
    expect(input).toHaveValue('2027-03-12');
  });

  it('reports an empty string when cleared', () => {
    const onValue = vi.fn();
    render(<Controlled onValue={onValue} />);
    const input = screen.getByLabelText('Fecha de vencimiento');
    fireEvent.change(input, { target: { value: '2027-03-12' } });
    fireEvent.change(input, { target: { value: '' } });
    expect(onValue).toHaveBeenLastCalledWith('');
  });

  it('exposes the error accessibly', () => {
    render(<Controlled error="La fecha ya venció" />);
    const input = screen.getByLabelText('Fecha de vencimiento');
    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription('La fecha ya venció Día/mes/año impreso en la caja');
  });
});
