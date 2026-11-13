import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { installDialogPolyfill } from '@/test/dialog-polyfill';
import { Sheet } from './Sheet';

beforeAll(installDialogPolyfill);

function Harness({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir</button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Registrar entrada">
        <input aria-label="Cantidad" />
        <p>Contenido</p>
      </Sheet>
    </>
  );
}

// A closed <dialog> is hidden from the accessibility tree, so look it up without role filtering.
const getDialog = () => document.querySelector('dialog') as HTMLDialogElement;

describe('Sheet', () => {
  it('stays closed until open is true, then opens as a modal dialog', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(getDialog()).not.toHaveAttribute('open');

    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(getDialog()).toHaveAttribute('open');
    expect(screen.getByText('Contenido')).toBeVisible();
  });

  it('is named by its title through aria-labelledby', () => {
    render(<Harness initiallyOpen />);
    expect(screen.getByRole('dialog', { name: 'Registrar entrada' })).toBe(getDialog());
  });

  it('closes with the close button and returns focus to the opener', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Abrir' });
    await user.click(opener);
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));

    expect(getDialog()).not.toHaveAttribute('open');
    expect(opener).toHaveFocus();
  });

  it('closes on Esc (the dialog `cancel` event) without relying on native close', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));

    const cancel = new Event('cancel', { cancelable: true });
    fireEvent(getDialog(), cancel);

    expect(cancel.defaultPrevented).toBe(true);
    expect(getDialog()).not.toHaveAttribute('open');
  });

  it('closes when clicking the backdrop but not when clicking inside the panel', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));

    await user.click(screen.getByText('Contenido'));
    expect(getDialog()).toHaveAttribute('open');

    await user.click(getDialog());
    expect(getDialog()).not.toHaveAttribute('open');
  });

  it('ignores a drag that starts inside the panel and ends on the backdrop', () => {
    render(<Harness initiallyOpen />);
    fireEvent.pointerDown(screen.getByLabelText('Cantidad'));
    fireEvent.click(getDialog());
    expect(getDialog()).toHaveAttribute('open');
  });

  it('unmounts the content once the exit animation has finished', () => {
    vi.useFakeTimers();
    try {
      render(<Harness initiallyOpen />);
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
      expect(screen.getByText('Contenido')).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(screen.queryByText('Contenido')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
