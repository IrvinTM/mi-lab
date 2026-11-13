import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { installDialogPolyfill } from '@/test/dialog-polyfill';
import { Alert } from './Alert';

beforeAll(installDialogPolyfill);

function setup(props: { destructive?: boolean } = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <Alert
      open
      title="¿Dar de baja 2 lotes vencidos?"
      message="Esta acción no se puede deshacer."
      confirmLabel="Dar de baja"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onConfirm, onCancel };
}

describe('Alert', () => {
  it('is an alertdialog named by its title and described by its message', () => {
    setup({ destructive: true });
    const dialog = screen.getByRole('alertdialog', { name: '¿Dar de baja 2 lotes vencidos?' });
    expect(dialog).toHaveAccessibleDescription('Esta acción no se puede deshacer.');
    expect(dialog).toHaveAttribute('open');
  });

  it('renders Cancelar and the confirm action', () => {
    setup({ destructive: true });
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Dar de baja' })).toBeVisible();
  });

  it('puts the initial focus on Cancelar, not on the destructive button', () => {
    setup({ destructive: true });
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Dar de baja' })).not.toHaveFocus();
  });

  it('paints the destructive action red', () => {
    setup({ destructive: true });
    expect(screen.getByRole('button', { name: 'Dar de baja' })).toHaveClass('text-danger');
  });

  it('focuses the confirm button in a non-destructive alert', () => {
    setup();
    const confirm = screen.getByRole('button', { name: 'Dar de baja' });
    expect(confirm).toHaveFocus();
    expect(confirm).not.toHaveClass('text-danger');
  });

  it('calls onConfirm / onCancel from the buttons', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = setup({ destructive: true });
    await user.click(screen.getByRole('button', { name: 'Dar de baja' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('cancels on Esc (the dialog `cancel` event)', () => {
    const { onCancel, onConfirm } = setup({ destructive: true });
    fireEvent(document.querySelector('dialog')!, new Event('cancel', { cancelable: true }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('does not dismiss on a backdrop click', async () => {
    const user = userEvent.setup();
    const { onCancel } = setup({ destructive: true });
    await user.click(document.querySelector('dialog')!);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('stays closed while open is false', () => {
    render(
      <Alert open={false} title="x" confirmLabel="Y" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(document.querySelector('dialog')).not.toHaveAttribute('open');
  });
});
