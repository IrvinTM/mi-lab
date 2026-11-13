import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchField } from './SearchField';

function Controlled({ initial = '', shortcut }: { initial?: string; shortcut?: boolean }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <SearchField label="Buscar producto" value={value} onChange={setValue} shortcut={shortcut} />
      <input aria-label="Otro campo" />
      <textarea aria-label="Notas" />
      <div contentEditable suppressContentEditableWarning aria-label="Editable" role="textbox" />
    </>
  );
}

describe('SearchField', () => {
  it('renders a labelled search box', () => {
    render(<Controlled />);
    expect(screen.getByRole('searchbox', { name: 'Buscar producto' })).toHaveAttribute(
      'placeholder',
      'Buscar',
    );
  });

  it('shows the Clear button only when there is text, and clears and refocuses', async () => {
    render(<Controlled />);
    const input = screen.getByRole('searchbox');
    expect(screen.queryByRole('button', { name: 'Borrar búsqueda' })).not.toBeInTheDocument();

    await userEvent.type(input, 'gluc');
    expect(input).toHaveValue('gluc');
    await userEvent.click(screen.getByRole('button', { name: 'Borrar búsqueda' }));
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Borrar búsqueda' })).not.toBeInTheDocument();
  });

  it('clears with Escape', async () => {
    render(<Controlled initial="gluc" />);
    const input = screen.getByRole('searchbox');
    input.focus();
    await userEvent.keyboard('{Escape}');
    expect(input).toHaveValue('');
  });

  it('focuses on "/" from anywhere else', async () => {
    render(<Controlled />);
    await userEvent.keyboard('/');
    const input = screen.getByRole('searchbox');
    expect(input).toHaveFocus();
    expect(input).toHaveValue('');
  });

  it('does not steal "/" while typing in another field', async () => {
    render(<Controlled />);
    for (const name of ['Otro campo', 'Notas']) {
      const other = screen.getByLabelText(name);
      await userEvent.click(other);
      await userEvent.keyboard('a/b');
      expect(other).toHaveFocus();
      expect(other).toHaveValue('a/b');
    }
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('does not steal "/" from a contenteditable element', async () => {
    render(<Controlled />);
    const editable = screen.getByRole('textbox', { name: 'Editable' });
    await userEvent.click(editable);
    await userEvent.keyboard('/');
    expect(screen.getByRole('searchbox')).not.toHaveFocus();
  });

  it('types "/" normally inside the search field itself', async () => {
    render(<Controlled />);
    await userEvent.type(screen.getByRole('searchbox'), 'a/b');
    expect(screen.getByRole('searchbox')).toHaveValue('a/b');
  });

  it('can turn the shortcut off', async () => {
    render(<Controlled shortcut={false} />);
    await userEvent.keyboard('/');
    expect(screen.getByRole('searchbox')).not.toHaveFocus();
  });

  it('can hide the label visually but keep it accessible', () => {
    render(<SearchField label="Buscar producto" value="" hideLabel />);
    expect(screen.getByText('Buscar producto')).toHaveClass('sr-only');
    expect(screen.getByRole('searchbox', { name: 'Buscar producto' })).toBeInTheDocument();
  });
});
