import { useState, type FormEvent } from 'react';
import type { Settings } from '@/domain/types';
import { useInventoryStore } from '@/state/store';
import { Button, NumberField, TextField, useToast } from '@/ui';
import { SettingsSection } from './SettingsSection';

const WHOLE_NUMBER = 'Ingresa un número entero de 1 o más.';

interface Drafts {
  labName: string;
  criticalDays: number | null;
  warningDays: number | null;
  defaultMinMonths: number | null;
  defaultMaxMonths: number | null;
}

function toDrafts(settings: Settings): Drafts {
  return {
    labName: settings.labName,
    criticalDays: settings.criticalDays,
    warningDays: settings.warningDays,
    defaultMinMonths: settings.defaultMinMonths,
    defaultMaxMonths: settings.defaultMaxMonths,
  };
}

const isPositive = (value: number | null): value is number => value !== null && value >= 1;

function validate(d: Drafts): Partial<Record<keyof Drafts, string>> {
  const errors: Partial<Record<keyof Drafts, string>> = {};
  if (!d.labName.trim()) errors.labName = 'Escribe el nombre del laboratorio.';
  if (!isPositive(d.criticalDays)) errors.criticalDays = WHOLE_NUMBER;
  if (!isPositive(d.warningDays)) errors.warningDays = WHOLE_NUMBER;
  else if (isPositive(d.criticalDays) && d.criticalDays >= d.warningDays) {
    errors.warningDays = 'Los días de advertencia deben ser más que los días críticos.';
  }
  if (!isPositive(d.defaultMinMonths)) errors.defaultMinMonths = WHOLE_NUMBER;
  if (!isPositive(d.defaultMaxMonths)) errors.defaultMaxMonths = WHOLE_NUMBER;
  else if (isPositive(d.defaultMinMonths) && d.defaultMaxMonths < d.defaultMinMonths) {
    errors.defaultMaxMonths = 'El máximo no puede ser menor que el mínimo.';
  }
  return errors;
}

/** Laboratory name, expiry alert thresholds and purchasing defaults, saved together. */
export function GeneralSettingsForm() {
  const toast = useToast();
  const settings = useInventoryStore((state) => state.data.settings);
  const [drafts, setDrafts] = useState(() => toDrafts(settings));
  const [submitted, setSubmitted] = useState(false);

  // Stored settings changed from outside (restored backup, demo reset): show them.
  const stored = JSON.stringify(toDrafts(settings));
  const [syncedWith, setSyncedWith] = useState(stored);
  if (stored !== syncedWith) {
    setSyncedWith(stored);
    setDrafts(toDrafts(settings));
    setSubmitted(false);
  }

  const set = <K extends keyof Drafts>(key: K) => (value: Drafts[K]) =>
    setDrafts((current) => ({ ...current, [key]: value }));

  const errors = validate(drafts);
  const shown = (field: keyof Drafts) => (submitted ? errors[field] : undefined);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    useInventoryStore.getState().updateSettings({
      labName: drafts.labName.trim(),
      criticalDays: drafts.criticalDays!,
      warningDays: drafts.warningDays!,
      defaultMinMonths: drafts.defaultMinMonths!,
      defaultMaxMonths: drafts.defaultMaxMonths!,
    });
    setSubmitted(false);
    toast.show({ message: 'Ajustes guardados' });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-8">
      <SettingsSection title="Laboratorio">
        <TextField
          label="Nombre del laboratorio"
          value={drafts.labName}
          onChange={set('labName')}
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
          error={shown('criticalDays')}
          help="Un lote que vence en este número de días o menos se marca como crítico."
        />
        <NumberField
          label="Días para advertencia"
          value={drafts.warningDays}
          onChange={set('warningDays')}
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
          error={shown('defaultMinMonths')}
          help="Por debajo de esta cobertura se sugiere comprar."
        />
        <NumberField
          label="Existencia máxima por defecto (meses de consumo)"
          value={drafts.defaultMaxMonths}
          onChange={set('defaultMaxMonths')}
          error={shown('defaultMaxMonths')}
          help="Tope de la cantidad sugerida de compra."
        />
      </SettingsSection>

      <div>
        <Button type="submit">Guardar</Button>
      </div>
    </form>
  );
}
