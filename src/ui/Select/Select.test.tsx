import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from './Select';

const options = [
  { value: 'a1', label: 'Química seca' },
  { value: 'a2', label: 'Pruebas especiales' },
  { value: 'a3', label: 'Inactiva', disabled: true },
];

function Controlled({ error }: { error?: string }) {
  const [value, setValue] = useState('');
  return (
    <Select
      label="Área"
      value={value}
      onChange={setValue}
      options={options}
      placeholder="Elige un área"
      error={error}
    />
  );
}

describe('Select', () => {
  it('renders a labelled combobox with a placeholder', () => {
    render(<Controlled />);
    const select = screen.getByRole('combobox', { name: 'Área' });
    expect(select).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Elige un área' })).toBeDisabled();
  });

  it('reports the chosen value', async () => {
    render(<Controlled />);
    const select = screen.getByLabelText('Área');
    await userEvent.selectOptions(select, 'Pruebas especiales');
    expect(select).toHaveValue('a2');
  });

  it('renders disabled options', () => {
    render(<Controlled />);
    expect(screen.getByRole('option', { name: 'Inactiva' })).toBeDisabled();
  });

  it('exposes the error accessibly', () => {
    render(<Controlled error="Elige un área" />);
    const select = screen.getByLabelText('Área');
    expect(select).toBeInvalid();
    expect(select).toHaveAccessibleDescription('Elige un área');
  });
});
