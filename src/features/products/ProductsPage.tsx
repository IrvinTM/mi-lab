import { PageHeader } from '@/ui';
import { PageActions } from '../shared/PageActions';

export function ProductsPage() {
  return <PageHeader title="Productos" actions={<PageActions />} />;
}
