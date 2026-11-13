import { useSearchParams } from 'react-router';
import { PageHeader, Sheet } from '@/ui';
import { useCloseSheet } from '../shared/forms';
import { IssueForm } from './IssueForm';

/** `/salida?producto=<id>&lote=<id>`: the issue form as a sheet, with its own address. */
export function IssuePage() {
  const [params] = useSearchParams();
  const close = useCloseSheet();

  return (
    <>
      <PageHeader title="Registrar salida" />
      <Sheet open onClose={close} title="Registrar salida">
        <IssueForm
          initialProductId={params.get('producto') ?? undefined}
          initialLotId={params.get('lote') ?? undefined}
          onDone={close}
          onCancel={close}
        />
      </Sheet>
    </>
  );
}
