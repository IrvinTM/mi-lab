import { useSearchParams } from 'react-router';
import { PageHeader, Sheet } from '@/ui';
import { useCloseSheet } from '../shared/forms';
import { ReceiveForm } from './ReceiveForm';

/** `/entrada`: the receipt form as a sheet, with its own address for direct links. */
export function ReceivePage() {
  const [params] = useSearchParams();
  const close = useCloseSheet();

  return (
    <>
      <PageHeader title="Registrar entrada" />
      <Sheet open onClose={close} title="Registrar entrada">
        <ReceiveForm
          initialProductId={params.get('producto') ?? undefined}
          onDone={close}
          onCancel={close}
        />
      </Sheet>
    </>
  );
}
