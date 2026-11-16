import { useSearchParams } from 'react-router';
import { useInventoryStore } from '@/state/store';
import { PageHeader, Sheet } from '@/ui';
import { useCloseSheet } from '../shared/forms';
import { NoProductsNotice } from '../shared/SetupGuide';
import { ReceiveForm } from './ReceiveForm';

/** `/entrada`: the receipt form as a sheet, with its own address for direct links. */
export function ReceivePage() {
  const [params] = useSearchParams();
  const close = useCloseSheet();
  const hasProducts = useInventoryStore((state) => state.data.products.some((p) => !p.archived));

  return (
    <>
      <PageHeader title="Registrar entrada" />
      <Sheet open onClose={close} title="Registrar entrada">
        {hasProducts ? (
          <ReceiveForm
            initialProductId={params.get('producto') ?? undefined}
            onDone={close}
            onCancel={close}
          />
        ) : (
          <NoProductsNotice onCancel={close} />
        )}
      </Sheet>
    </>
  );
}
