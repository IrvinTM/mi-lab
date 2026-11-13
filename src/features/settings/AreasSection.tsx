import { useMemo, useState, type FormEvent } from 'react';
import type { Area } from '@/domain/types';
import { countNoun } from '@/domain/plural';
import { useInventoryStore } from '@/state/store';
import { Alert, Button, List, ListRow, Sheet, TextField, useToast } from '@/ui';

const productCount = (count: number) => countNoun(count, 'producto');

function RenameForm({ area, onClose }: { area: Area; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(area.name);
  const [error, setError] = useState<string>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = useInventoryStore.getState().renameArea(area.id, name);
    if (!result.ok) {
      setError(result.errors.name ?? result.error);
      return;
    }
    onClose();
    toast.show({ message: `Área renombrada · ${name.trim()}` });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <TextField
        label="Nombre del área"
        value={name}
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

/** Catalog: the laboratory areas. Only areas without products can be removed. */
export function AreasSection() {
  const toast = useToast();
  const areas = useInventoryStore((state) => state.data.areas);
  const products = useInventoryStore((state) => state.data.products);
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState<string>();
  const [renaming, setRenaming] = useState<Area | null>(null);
  const [removing, setRemoving] = useState<Area | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);

  const counts = useMemo(() => {
    const byArea = new Map<string, number>();
    for (const product of products)
      byArea.set(product.areaId, (byArea.get(product.areaId) ?? 0) + 1);
    return byArea;
  }, [products]);

  const add = (event: FormEvent) => {
    event.preventDefault();
    const result = useInventoryStore.getState().addArea(newName);
    if (!result.ok) {
      setAddError(result.errors.name ?? result.error);
      return;
    }
    toast.show({ message: `Área agregada · ${newName.trim()}` });
    setNewName('');
    setAddError(undefined);
  };

  const confirmRemove = () => {
    setRemoveOpen(false);
    if (!removing) return;
    const result = useInventoryStore.getState().removeArea(removing.id);
    toast.show({ message: result.ok ? `Área eliminada · ${removing.name}` : result.error });
  };

  return (
    <div className="flex flex-col gap-4">
      <List
        header="Catálogo · Áreas"
        footer="Para eliminar un área, antes mueve sus productos a otra desde “Editar producto”."
      >
        {areas.length === 0 ? <ListRow title="Todavía no hay áreas." /> : null}
        {areas.map((area) => {
          const count = counts.get(area.id) ?? 0;
          return (
            <ListRow
              key={area.id}
              title={area.name}
              subtitle={productCount(count)}
              trailing={
                <span className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="plain"
                    aria-label={`Renombrar ${area.name}`}
                    onClick={() => setRenaming(area)}
                  >
                    Renombrar
                  </Button>
                  <Button
                    size="sm"
                    variant="plain"
                    aria-label={`Eliminar ${area.name}`}
                    disabled={count > 0}
                    onClick={() => {
                      setRemoving(area);
                      setRemoveOpen(true);
                    }}
                  >
                    Eliminar
                  </Button>
                </span>
              }
            />
          );
        })}
      </List>

      <form
        onSubmit={add}
        noValidate
        className="flex flex-col gap-2 sheet:flex-row sheet:items-start"
      >
        <TextField
          className="flex-1"
          label="Nueva área"
          value={newName}
          onChange={(value) => {
            setNewName(value);
            setAddError(undefined);
          }}
          error={addError}
          help="Por ejemplo: Hematología."
        />
        <Button type="submit" variant="tinted" className="sheet:mt-6">
          Agregar
        </Button>
      </form>

      <Sheet open={renaming !== null} onClose={() => setRenaming(null)} title="Renombrar área">
        {renaming ? <RenameForm area={renaming} onClose={() => setRenaming(null)} /> : null}
      </Sheet>
      <Alert
        open={removeOpen}
        destructive
        title={`¿Eliminar el área ${removing?.name ?? ''}?`}
        message="El área está vacía. Si la necesitas de nuevo, tendrás que crearla otra vez."
        confirmLabel="Eliminar"
        onCancel={() => setRemoveOpen(false)}
        onConfirm={confirmRemove}
      />
    </div>
  );
}
