import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TextField } from './TextField';

function Controlled(props: { error?: string; help?: string }) {
  const [value, setValue] = useState('');
  return <TextField label="Número de lote" value={value} onChange={setValue} {...props} />;
}

describe('TextField', () => {
  it('associates the visible label with the input', () => {
    render(<Controlled />);
    expect(screen.getByLabelText('Número de lote')).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByText('Número de lote').tagName).toBe('LABEL');
  });

  it('reports typed text through onChange', async () => {
    render(<Controlled />);
    const input = screen.getByLabelText('Número de lote');
    await userEvent.type(input, 'LT42');
    expect(input).toHaveValue('LT42');
  });

  it('is valid and has no description by default', () => {
    render(<Controlled />);
    const input = screen.getByLabelText('Número de lote');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
  });

  it('links help text with aria-describedby', () => {
    render(<Controlled help="Está impreso en la caja" />);
    expect(screen.getByLabelText('Número de lote')).toHaveAccessibleDescription(
      'Está impreso en la caja',
    );
  });

  it('exposes the error accessibly, before the help text', () => {
    render(<Controlled error="Falta el lote" help="Está impreso en la caja" />);
    const input = screen.getByLabelText('Número de lote');
    expect(input).toBeInvalid();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Falta el lote Está impreso en la caja');
  });

  it('keeps ids unique across fields', () => {
    render(
      <>
        <TextField label="A" value="" help="ayuda A" />
        <TextField label="B" value="" help="ayuda B" />
      </>,
    );
    expect(screen.getByLabelText('A')).toHaveAccessibleDescription('ayuda A');
    expect(screen.getByLabelText('B')).toHaveAccessibleDescription('ayuda B');
  });

  it('passes native attributes through', () => {
    render(<TextField label="Nombre" value="" placeholder="Glucosa" disabled />);
    const input = screen.getByLabelText('Nombre');
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('placeholder', 'Glucosa');
  });
});
