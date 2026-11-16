import { useSearchParams } from 'react-router';
import { useInventoryStore } from '@/state/store';
import { PageHeader, Sheet } from '@/ui';
import { useCloseSheet } from '../shared/forms';
import { NoProductsNotice } from '../shared/SetupGuide';
import { IssueForm } from './IssueForm';

/** `/salida?producto=<id>&lote=<id>`: the issue form as a sheet, with its own address. */
export function IssuePage() {
  const [params] = useSearchParams();
  const close = useCloseSheet();
  const hasProducts = useInventoryStore((state) => state.data.products.some((p) => !p.archived));

  return (
    <>
      <PageHeader title="Registrar salida" />
      <Sheet open onClose={close} title="Registrar salida">
        {hasProducts ? (
          <IssueForm
            initialProductId={params.get('producto') ?? undefined}
            initialLotId={params.get('lote') ?? undefined}
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
