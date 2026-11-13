import { useRef, useState, type ChangeEvent } from 'react';
import { backupFileError, checkBackup } from '@/state/backup';
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

type Confirmation = 'restore' | 'reset' | null;

/** Download, restore and reset of the whole dataset. */
export function BackupSection() {
  const toast = useToast();
  const today = useToday();
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<{ json: unknown; fileName: string }>();
  const [confirming, setConfirming] = useState<Confirmation>(null);

  const download = () => {
    const { data } = useInventoryStore.getState();
    downloadText(JSON.stringify(data, null, 2), `mi-lab-respaldo-${today}.json`);
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
    await useInventoryStore.getState().resetToSeed();
    setError(undefined);
    toast.show({ message: 'Datos demo restablecidos' });
  };

  const cancel = () => {
    setConfirming(null);
    setPending(undefined);
  };

  return (
    <SettingsSection
      title="Respaldo"
      footer="Los datos se guardan solo en este navegador. Descarga un respaldo con regularidad para no perderlos."
    >
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
          Restablecer datos demo
        </Button>
        <p className="text-footnote text-label-secondary">
          Borra tus datos y vuelve a cargar el inventario de ejemplo.
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
        title="¿Restablecer los datos demo?"
        message="Se borrarán todos los productos, lotes y movimientos actuales y se cargará el inventario de ejemplo. No se puede deshacer."
        confirmLabel="Restablecer"
        onCancel={cancel}
        onConfirm={() => void reset()}
      />
    </SettingsSection>
  );
}
