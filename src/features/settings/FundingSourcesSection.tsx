import { useMemo, useState, type FormEvent } from 'react';
import { LIMITS } from '@/domain/limits';
import type { FundingSource } from '@/domain/types';
import { countNoun } from '@/domain/plural';
import { useInventoryStore } from '@/state/store';
import { Alert, Button, List, ListRow, NumberField, Sheet, TextField, useToast } from '@/ui';

const usageCount = (count: number) => countNoun(count, 'lote');

function RenameForm({ source, onClose }: { source: FundingSource; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(source.name);
  const [error, setError] = useState<string>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = useInventoryStore.getState().renameFundingSource(source.code, name);
    if (!result.ok) {
      setError(result.errors.name ?? result.error);
      return;
    }
    onClose();
    toast.show({ message: `Procedencia renombrada · ${name.trim()}` });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <TextField
        label="Nombre de la procedencia"
        value={name}
        maxLength={LIMITS.longText}
        onChange={(value) => {
          setName(value);
          setError(undefined);
        }}
        error={error}
        autoFocus
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="plain" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit">Renombrar</Button>
      </div>
    </form>
  );
}

/** Catalog: where the stock comes from (GOES, FOSALUD, donations…). Only unused sources can be removed. */
export function FundingSourcesSection() {
  const toast = useToast();
  const sources = useInventoryStore((state) => state.data.fundingSources);
  const lots = useInventoryStore((state) => state.data.lots);
  const movements = useInventoryStore((state) => state.data.movements);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [renaming, setRenaming] = useState<FundingSource | null>(null);
  const [removing, setRemoving] = useState<FundingSource | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);

  const { lotCounts, inUse } = useMemo(() => {
    const byCode = new Map<number, number>();
    for (const lot of lots) {
      if (lot.sourceCode !== undefined)
        byCode.set(lot.sourceCode, (byCode.get(lot.sourceCode) ?? 0) + 1);
    }
    const used = new Set(byCode.keys());
    for (const movement of movements) {
      if (movement.sourceCode !== undefined) used.add(movement.sourceCode);
    }
    return { lotCounts: byCode, inUse: used };
  }, [lots, movements]);

  const add = (event: FormEvent) => {
    event.preventDefault();
    const result = useInventoryStore.getState().addFundingSource(newName, newCode ?? undefined);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    toast.show({ message: `Procedencia agregada · ${newName.trim()}` });
    setNewName('');
    setNewCode(null);
    setErrors({});
  };

  const confirmRemove = () => {
    setRemoveOpen(false);
    if (!removing) return;
    const result = useInventoryStore.getState().removeFundingSource(removing.code);
    toast.show({ message: result.ok ? `Procedencia eliminada · ${removing.name}` : result.error });
  };

  return (
    <div className="flex flex-col gap-4">
      <List
        header="Catálogo · Procedencias"
        footer="Una procedencia con lotes o movimientos no se puede eliminar, pero sí renombrar."
      >
        {sources.length === 0 ? <ListRow title="Todavía no hay procedencias." /> : null}
        {sources.map((source) => (
          <ListRow
            key={source.code}
            title={source.name}
            subtitle={`Código ${source.code} · ${usageCount(lotCounts.get(source.code) ?? 0)}`}
            trailing={
              <span className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="plain"
                  aria-label={`Renombrar ${source.name}`}
                  onClick={() => setRenaming(source)}
                >
                  Renombrar
                </Button>
                <Button
                  size="sm"
                  variant="plain"
                  aria-label={`Eliminar ${source.name}`}
                  disabled={inUse.has(source.code)}
                  onClick={() => {
                    setRemoving(source);
                    setRemoveOpen(true);
                  }}
                >
                  Eliminar
                </Button>
              </span>
            }
          />
        ))}
      </List>

      <form
        onSubmit={add}
        noValidate
        className="flex flex-col gap-2 sheet:flex-row sheet:items-start"
      >
        <TextField
          className="flex-1"
          label="Nueva procedencia"
          value={newName}
          maxLength={LIMITS.longText}
          onChange={(value) => {
            setNewName(value);
            setErrors({});
          }}
          error={errors.name}
          help="Por ejemplo: Donación."
        />
        <NumberField
          className="sheet:w-40"
          label="Código (opcional)"
          value={newCode}
          max={LIMITS.maxSourceCode}
          onChange={(value) => {
            setNewCode(value);
            setErrors({});
          }}
          error={errors.code}
          help="Si lo dejas vacío se asigna el siguiente."
        />
        <Button
          type="submit"
          variant="tinted"
          aria-label="Agregar procedencia"
          className="sheet:mt-6"
        >
          Agregar
        </Button>
      </form>

      <Sheet
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Renombrar procedencia"
      >
        {renaming ? <RenameForm source={renaming} onClose={() => setRenaming(null)} /> : null}
      </Sheet>
      <Alert
        open={removeOpen}
        destructive
        title={`¿Eliminar la procedencia ${removing?.name ?? ''}?`}
        message="Ningún lote ni movimiento la usa. Si la necesitas de nuevo, tendrás que crearla otra vez."
        confirmLabel="Eliminar"
        onCancel={() => setRemoveOpen(false)}
        onConfirm={confirmRemove}
      />
    </div>
  );
}
