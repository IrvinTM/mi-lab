import { useState, type FormEvent } from 'react';
import { LIMITS } from '@/domain/limits';
import type { Settings } from '@/domain/types';
import { validateSettings, type SettingsDraft } from '@/domain/validation';
import { useInventoryStore } from '@/state/store';
import { Button, NumberField, TextField, useToast } from '@/ui';
import { useFocusFirstInvalid } from '../shared/forms';
import { SettingsSection } from './SettingsSection';

type Drafts = Omit<SettingsDraft, 'todayOverride'>;

function toDrafts(settings: Settings): Drafts {
  return {
    labName: settings.labName,
    criticalDays: settings.criticalDays,
    warningDays: settings.warningDays,
    defaultMinMonths: settings.defaultMinMonths,
    defaultMaxMonths: settings.defaultMaxMonths,
  };
}

/** Laboratory name, expiry alert thresholds and purchasing defaults, saved together. */
export function GeneralSettingsForm() {
  const toast = useToast();
  const settings = useInventoryStore((state) => state.data.settings);
  const [drafts, setDrafts] = useState(() => toDrafts(settings));
  const [submitted, setSubmitted] = useState(false);
  const { ref: formRef, focusFirstInvalid } = useFocusFirstInvalid();

  // Stored settings changed from outside (restored backup, demo reset): show them.
  const stored = JSON.stringify(toDrafts(settings));
  const [syncedWith, setSyncedWith] = useState(stored);
  if (stored !== syncedWith) {
    setSyncedWith(stored);
    setDrafts(toDrafts(settings));
    setSubmitted(false);
  }

  const set =
    <K extends keyof Drafts>(key: K) =>
    (value: Drafts[K]) =>
      setDrafts((current) => ({ ...current, [key]: value }));

  const errors = validateSettings(drafts);
  const shown = (field: keyof Drafts) => (submitted ? errors[field] : undefined);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) {
      focusFirstInvalid();
      return;
    }
    const result = useInventoryStore.getState().updateSettings({
      labName: drafts.labName.trim(),
      criticalDays: drafts.criticalDays!,
      warningDays: drafts.warningDays!,
      defaultMinMonths: drafts.defaultMinMonths!,
      defaultMaxMonths: drafts.defaultMaxMonths!,
    });
    if (!result.ok) return;
    setSubmitted(false);
    toast.show({ message: 'Ajustes guardados' });
  };

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-8">
      <SettingsSection title="Laboratorio">
        <TextField
          label="Nombre del laboratorio"
          value={drafts.labName}
          onChange={set('labName')}
          maxLength={LIMITS.longText}
          error={shown('labName')}
          autoComplete="organization"
        />
      </SettingsSection>

      <SettingsSection
        title="Alertas de vencimiento"
        footer="Cada lote se clasifica según los días que faltan para su vencimiento."
      >
        <NumberField
          label="Días para estado crítico"
          value={drafts.criticalDays}
          onChange={set('criticalDays')}
          max={LIMITS.maxSettingDays}
          error={shown('criticalDays')}
          help="Un lote que vence en este número de días o menos se marca como crítico."
        />
        <NumberField
          label="Días para advertencia"
          value={drafts.warningDays}
          onChange={set('warningDays')}
          max={LIMITS.maxSettingDays}
          error={shown('warningDays')}
          help="Un lote que vence en este número de días o menos (y no es crítico) se marca con advertencia."
        />
      </SettingsSection>

      <SettingsSection
        title="Compras"
        footer="Se usan en los productos que no tienen existencia mínima o máxima propia."
      >
        <NumberField
          label="Existencia mínima por defecto (meses de consumo)"
          value={drafts.defaultMinMonths}
          onChange={set('defaultMinMonths')}
          max={LIMITS.maxSettingMonths}
          error={shown('defaultMinMonths')}
          help="Por debajo de esta cobertura se sugiere comprar."
        />
        <NumberField
          label="Existencia máxima por defecto (meses de consumo)"
          value={drafts.defaultMaxMonths}
          onChange={set('defaultMaxMonths')}
          max={LIMITS.maxSettingMonths}
          error={shown('defaultMaxMonths')}
          help="Tope de la cantidad sugerida de compra."
        />
      </SettingsSection>

      <div>
        <Button type="submit">Guardar ajustes</Button>
      </div>
    </form>
  );
}
