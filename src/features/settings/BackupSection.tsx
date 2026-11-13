import { useRef, useState, type ChangeEvent } from 'react';
import { migrate } from '@/data/migrate';
import { useToday } from '@/state/selectors';
import { useInventoryStore } from '@/state/store';
import { Alert, Button, useToast } from '@/ui';
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
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mi-lab-respaldo-${today}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setError(undefined);
    toast.show({ message: 'Respaldo descargado' });
  };

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    input.value = ''; // so choosing the same file again fires `change`
    if (!file) return;
    setError(undefined);
    try {
      const json: unknown = JSON.parse(await readText(file));
      migrate(json); // reject unusable files before asking to replace anything
      setPending({ json, fileName: file.name });
      setConfirming('restore');
    } catch (problem) {
      setError(
        problem instanceof SyntaxError
          ? 'El archivo no es un JSON válido.'
          : problem instanceof Error
            ? problem.message
            : 'No se pudo leer el archivo.',
      );
    }
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

  const reset = () => {
    setConfirming(null);
    useInventoryStore.getState().resetToSeed();
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
          accept="application/json"
          hidden
          aria-label="Archivo de respaldo"
          onChange={(event) => void chooseFile(event)}
        />
        <p className="text-footnote text-label-secondary">
          Reemplaza todos los datos actuales por los de un respaldo descargado antes.
        </p>
        {error ? (
          <p role="alert" className="text-footnote text-red">
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
        onConfirm={reset}
      />
    </SettingsSection>
  );
}
