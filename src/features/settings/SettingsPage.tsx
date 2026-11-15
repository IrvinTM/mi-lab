import { PageHeader } from '@/ui';
import { AreasSection } from './AreasSection';
import { BackupSection } from './BackupSection';
import { FundingSourcesSection } from './FundingSourcesSection';
import { GeneralSettingsForm } from './GeneralSettingsForm';
import { SimulatedDateSection } from './SimulatedDateSection';

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Ajustes" />
      <div className="flex max-w-2xl flex-col gap-8">
        <GeneralSettingsForm />
        <SimulatedDateSection />
        <BackupSection />
        <AreasSection />
        <FundingSourcesSection />
      </div>
    </>
  );
}
