import { useRef, useState, type ChangeEvent } from 'react';
import { isDesktop, useAutoBackupStatus } from '@/state/autoBackup';
import { backupFileError, checkBackup, serializeBackup } from '@/state/backup';
import { useToday } from '@/state/selectors';
import { useInventoryStore } from '@/state/store';
import { Alert, Button, useToast } from '@/ui';
import { downloadText } from '../shared/download';
import { SettingsSection } from './SettingsSection';

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function formatSavedAt(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('es-SV', { dateStyle: 'long', timeStyle: 'short' });
}

/** Desktop app only: where the automatic daily copies go and when the last one was made. */
function AutoBackupInfo() {
  const { status, error } = useAutoBackupStatus();
  return (
    <div className="flex flex-col gap-1">
      <p className="text-body text-label">Respaldo automático</p>
      <p className="text-footnote text-label-secondary">
        Cada día con cambios se guarda una copia en{' '}
        <span className="break-all">{status?.dir ?? 'Documentos\\Mi-lab\\Respaldos'}</span> (se
        conservan las últimas 30).
      </p>
      <p className="text-footnote text-label-secondary">
        Último respaldo automático:{' '}
        {status?.lastSavedAt ? formatSavedAt(status.lastSavedAt) : 'todavía no hay ninguno'}
      </p>
      {status?.database ? (
        <p className="text-footnote text-label-secondary">
          El inventario se guarda en <span className="break-all">{status.database}</span>.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-footnote text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type Confirmation = 'restore' | 'reset' | null;

/** Download, restore and reset of the whole dataset. */
export function BackupSection() {
  const desktop = isDesktop();
  const toast = useToast();
  const demoData = useInventoryStore((state) => state.demoData);
  const today = useToday();
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<{ json: unknown; fileName: string }>();
  const [confirming, setConfirming] = useState<Confirmation>(null);

  const download = () => {
    const { data } = useInventoryStore.getState();
    downloadText(serializeBackup(data), `mi-lab-respaldo-${today}.json`);
    setError(undefined);
    toast.show({ message: 'Respaldo descargado' });
  };

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    input.value = ''; // so choosing the same file again fires `change`
    if (!file) return;
    const tooBig = backupFileError(file);
    if (tooBig) {
      setError(tooBig);
      return;
    }
    setError(undefined);
    let text: string;
    try {
      text = await readText(file);
    } catch {
      setError('No se pudo leer el archivo.');
      return;
    }
    // Reject unusable files before asking to replace anything.
    const check = checkBackup(text);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setPending({ json: check.json, fileName: file.name });
    setConfirming('restore');
  };

  const restore = () => {
    setConfirming(null);
    if (!pending) return;
    const result = useInventoryStore.getState().importBackup(pending.json);
    setPending(undefined);
    if (!result.ok) {
      setError(result.error ?? 'El respaldo no es válido.');
      return;
    }
    toast.show({ message: 'Respaldo restaurado' });
  };

  const reset = async () => {
    setConfirming(null);
    if (demoData) {
      await useInventoryStore.getState().resetToSeed();
    } else {
      useInventoryStore.getState().resetToEmpty();
    }
    setError(undefined);
    toast.show({ message: demoData ? 'Datos demo restablecidos' : 'Datos borrados' });
  };

  const cancel = () => {
    setConfirming(null);
    setPending(undefined);
  };

  return (
    <SettingsSection
      title="Respaldo"
      footer={
        desktop
          ? 'Los datos se guardan solo en este equipo. Además del respaldo automático, guarda una copia en una memoria USB con regularidad.'
          : 'Los datos se guardan solo en este navegador. Descarga un respaldo con regularidad para no perderlos.'
      }
    >
      {desktop ? <AutoBackupInfo /> : null}
      <div className="flex flex-col gap-1">
        <Button variant="tinted" onClick={download}>
          Descargar respaldo (JSON)
        </Button>
        <p className="text-footnote text-label-secondary">
          Guarda un archivo con todo el inventario, los movimientos y los ajustes.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <Button variant="tinted" onClick={() => fileInput.current?.click()}>
          Restaurar respaldo
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          aria-label="Archivo de respaldo"
          onChange={(event) => void chooseFile(event)}
        />
        <p className="text-footnote text-label-secondary">
          Reemplaza todos los datos actuales por los de un respaldo descargado antes.
        </p>
        {error ? (
          <p role="alert" className="text-footnote text-danger">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <Button variant="destructive" onClick={() => setConfirming('reset')}>
          {demoData ? 'Restablecer datos demo' : 'Borrar todos los datos'}
        </Button>
        <p className="text-footnote text-label-secondary">
          {demoData
            ? 'Borra tus datos y vuelve a cargar el inventario de ejemplo.'
            : 'Borra todo el inventario y deja la aplicación vacía. Descarga un respaldo antes.'}
        </p>
      </div>

      <Alert
        open={confirming === 'restore'}
        destructive
        title="¿Restaurar este respaldo?"
        message={`Se reemplazarán todos los datos actuales por los de ${pending?.fileName ?? 'el archivo'}. No se puede deshacer.`}
        confirmLabel="Restaurar"
        onCancel={cancel}
        onConfirm={restore}
      />
      <Alert
        open={confirming === 'reset'}
        destructive
        title={demoData ? '¿Restablecer los datos demo?' : '¿Borrar todos los datos?'}
        message={
          demoData
            ? 'Se borrarán todos los productos, lotes y movimientos actuales y se cargará el inventario de ejemplo. No se puede deshacer.'
            : 'Se perderán todos los productos, lotes, movimientos y ajustes, salvo que tengas un respaldo descargado. La aplicación quedará vacía. No se puede deshacer.'
        }
        confirmLabel={demoData ? 'Restablecer' : 'Borrar todo'}
        onCancel={cancel}
        onConfirm={() => void reset()}
      />
    </SettingsSection>
  );
}
