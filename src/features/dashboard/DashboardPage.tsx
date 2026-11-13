import { PageHeader } from '@/ui';
import { PageActions } from '../shared/PageActions';

export function DashboardPage() {
  return <PageHeader title="Resumen" actions={<PageActions />} />;
}
