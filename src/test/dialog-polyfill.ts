/**
 * Minimal `<dialog>` polyfill for jsdom, which lacks `showModal()`/`close()`. It covers what the UI
 * kit's tests observe: the `open` attribute, the initial focus, the `close` event and the return of
 * focus on close. It does not trap focus or fire `cancel` (tests dispatch `cancel` themselves).
 */
export function installDialogPolyfill() {
  const proto = HTMLDialogElement.prototype;
  const openers = new WeakMap<HTMLDialogElement, HTMLElement | null>();

  proto.showModal = function showModal(this: HTMLDialogElement) {
    if (this.open) throw new DOMException('Already open', 'InvalidStateError');
    openers.set(
      this,
      document.activeElement instanceof HTMLElement ? document.activeElement : null,
    );
    this.setAttribute('open', '');
    const target =
      this.querySelector<HTMLElement>('[autofocus]') ??
      this.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]');
    target?.focus();
  };

  proto.close = function close(this: HTMLDialogElement) {
    if (!this.open) return;
    this.removeAttribute('open');
    openers.get(this)?.focus();
    this.dispatchEvent(new Event('close'));
  };
}
