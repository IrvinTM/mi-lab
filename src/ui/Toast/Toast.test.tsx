import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from './Toast';
import { useToast, type ToastOptions } from './toast-context';

function Trigger({ options }: { options: ToastOptions }) {
  const { show } = useToast();
  return <button onClick={() => show(options)}>Mostrar</button>;
}

function setup(options: ToastOptions = { message: 'Entrada registrada' }) {
  render(
    <ToastProvider>
      <Trigger options={options} />
    </ToastProvider>,
  );
}

const trigger = () => fireEvent.click(screen.getByRole('button', { name: 'Mostrar' }));
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
const focus = (name: string) => act(() => screen.getByRole('button', { name }).focus());
const undoAction = { label: 'Deshacer', onAction: vi.fn() };

afterEach(() => vi.useRealTimers());

// userEvent needs real timers (Testing Library only knows how to flush jest's fake timers), so
// the timing tests below drive the DOM with fireEvent / focus() instead.
describe('Toast timing', () => {
  beforeEach(() => vi.useFakeTimers());

  it('closes by itself after 5 s', () => {
    setup();
    trigger();
    advance(4999);
    expect(screen.getByText('Entrada registrada')).toBeInTheDocument();
    advance(1);
    expect(screen.queryByText('Entrada registrada')).not.toBeInTheDocument();
  });

  it('pauses while hovered and resumes afterwards', () => {
    setup();
    trigger();
    advance(3000);
    const toast = screen.getByText('Entrada registrada').parentElement!;
    fireEvent.mouseEnter(toast);
    advance(20_000);
    expect(screen.getByText('Entrada registrada')).toBeInTheDocument();

    fireEvent.mouseLeave(toast);
    advance(1499);
    expect(screen.getByText('Entrada registrada')).toBeInTheDocument();
    advance(2001);
    expect(screen.queryByText('Entrada registrada')).not.toBeInTheDocument();
  });

  it('pauses while focus is inside and resumes when it leaves', () => {
    setup({ message: 'Salida registrada', action: undoAction });
    trigger();
    focus('Deshacer');
    advance(20_000);
    expect(screen.getByText('Salida registrada')).toBeInTheDocument();

    // Moving between the toast's own buttons does not unpause it.
    focus('Cerrar notificación');
    advance(20_000);
    expect(screen.getByText('Salida registrada')).toBeInTheDocument();

    act(() => screen.getByRole('button', { name: 'Cerrar notificación' }).blur());
    advance(5000);
    expect(screen.queryByText('Salida registrada')).not.toBeInTheDocument();
  });

  it('stacks several toasts and expires each on its own clock', () => {
    setup();
    trigger();
    advance(2000);
    trigger();
    expect(screen.getAllByText('Entrada registrada')).toHaveLength(2);

    advance(3000);
    expect(screen.getAllByText('Entrada registrada')).toHaveLength(1);
    advance(2000);
    expect(screen.queryByText('Entrada registrada')).not.toBeInTheDocument();
  });
});

describe('Toast', () => {
  it('has a polite live region that exists before any toast', () => {
    setup();
    const region = document.querySelector('[aria-live]');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toBeEmptyDOMElement();
  });

  it('shows the message inside the live region', () => {
    setup();
    trigger();
    expect(document.querySelector('[aria-live]')).toHaveTextContent('Entrada registrada');
  });

  it('runs the action from the keyboard and dismisses the toast', async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    setup({ message: 'Salida registrada', action: { label: 'Deshacer', onAction } });
    trigger();
    focus('Deshacer');
    await user.keyboard('{Enter}');

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Salida registrada')).not.toBeInTheDocument();
  });

  it('is reachable by Tab and dismisses with Esc', async () => {
    const user = userEvent.setup();
    setup({ message: 'Uno', action: undoAction });
    await user.click(screen.getByRole('button', { name: 'Mostrar' }));
    await user.tab();
    expect(screen.getByRole('button', { name: 'Deshacer' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByText('Uno')).not.toBeInTheDocument();
  });

  it('⌘Z / Ctrl+Z runs the newest "Deshacer" without reaching the toast', async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    setup({ message: 'Salida registrada', action: { label: 'Deshacer', onAction } });
    await user.click(screen.getByRole('button', { name: 'Mostrar' }));
    await user.keyboard('{Control>}z{/Control}');
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Salida registrada')).not.toBeInTheDocument();
  });

  it('leaves ⌘Z to a text field that has the focus', async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    setup({ message: 'Salida registrada', action: { label: 'Deshacer', onAction } });
    await user.click(screen.getByRole('button', { name: 'Mostrar' }));
    const field = document.body.appendChild(document.createElement('input'));
    field.focus();
    await user.keyboard('{Meta>}z{/Meta}');
    expect(onAction).not.toHaveBeenCalled();
    field.remove();
  });

  it('sits above the tab bar below 900 px and at the bottom edge on desktop', () => {
    setup();
    const region = document.querySelector('[aria-live]');
    expect(region?.className).toContain(
      'bottom-[calc(var(--tabbar-height)+env(safe-area-inset-bottom))]',
    );
    expect(region).toHaveClass('desktop:bottom-0');
  });

  it('dismisses with the close button', () => {
    setup({ message: 'Uno' });
    trigger();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar notificación' }));
    expect(screen.queryByText('Uno')).not.toBeInTheDocument();
  });

  it('throws a clear error when useToast runs outside the provider', () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useToast())).toThrow(
      'useToast must be used inside <ToastProvider>',
    );
    silence.mockRestore();
  });
});
