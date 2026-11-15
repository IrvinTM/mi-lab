import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { ToastProvider } from '@/ui';
import type { InventoryData } from '@/domain/types';
import { useInventoryStore } from '@/state/store';
import { installDialogPolyfill } from '@/test/dialog-polyfill';
import { sampleData } from '@/test/fixtures';
import { SettingsPage } from './SettingsPage';

beforeAll(installDialogPolyfill);

function dataset(): InventoryData {
  const data = sampleData();
  data.areas.push({ id: 'a2', name: 'Hematología' });
  data.settings.todayOverride = undefined;
  return data;
}

function setData(data: InventoryData) {
  act(() => useInventoryStore.setState({ status: 'ready', loadError: undefined, data }));
}

const settings = () => useInventoryStore.getState().data.settings;

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <SettingsPage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

function backupFile(content: unknown, name = 'respaldo.json') {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  return new File([text], name, { type: 'application/json' });
}

beforeEach(() => {
  window.localStorage.clear();
  setData(dataset());
});

afterEach(() => vi.restoreAllMocks());

describe('SettingsPage', () => {
  it('shows the title and the stored values without NaN or Infinity', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Ajustes' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre del laboratorio')).toHaveValue('Laboratorio clínico');
    expect(screen.getByLabelText('Días para estado crítico')).toHaveValue('30');
    expect(screen.getByLabelText('Días para advertencia')).toHaveValue('90');
    expect(screen.getByLabelText('Existencia mínima por defecto (meses de consumo)')).toHaveValue(
      '1',
    );
    expect(screen.getByLabelText('Existencia máxima por defecto (meses de consumo)')).toHaveValue(
      '3',
    );
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  });

  describe('general settings', () => {
    it('saves the changes and confirms with a toast', async () => {
      const user = userEvent.setup();
      renderPage();
      const name = screen.getByLabelText('Nombre del laboratorio');
      await user.clear(name);
      await user.type(name, '  Lab Central ');
      const critical = screen.getByLabelText('Días para estado crítico');
      await user.clear(critical);
      await user.type(critical, '15');
      const warning = screen.getByLabelText('Días para advertencia');
      await user.clear(warning);
      await user.type(warning, '60');
      const min = screen.getByLabelText('Existencia mínima por defecto (meses de consumo)');
      await user.clear(min);
      await user.type(min, '2');
      const max = screen.getByLabelText('Existencia máxima por defecto (meses de consumo)');
      await user.clear(max);
      await user.type(max, '2');
      await user.click(screen.getByRole('button', { name: 'Guardar ajustes' }));

      expect(settings()).toMatchObject({
        labName: 'Lab Central',
        criticalDays: 15,
        warningDays: 60,
        defaultMinMonths: 2,
        defaultMaxMonths: 2,
      });
      expect(screen.getByText('Ajustes guardados')).toBeInTheDocument();
    });

    it('does not save and explains invalid values', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.clear(screen.getByLabelText('Nombre del laboratorio'));
      await user.clear(screen.getByLabelText('Días para estado crítico'));
      const warning = screen.getByLabelText('Días para advertencia');
      await user.clear(warning);
      await user.type(warning, '0');
      const min = screen.getByLabelText('Existencia mínima por defecto (meses de consumo)');
      await user.clear(min);
      await user.type(min, '5');
      await user.click(screen.getByRole('button', { name: 'Guardar ajustes' }));

      expect(screen.getByText('Escribe el nombre del laboratorio.')).toBeInTheDocument();
      expect(screen.getAllByText('Ingresa un número entero de 1 o más.')).toHaveLength(2);
      expect(screen.getByText('El máximo no puede ser menor que el mínimo.')).toBeInTheDocument();
      expect(screen.getByLabelText('Días para estado crítico')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      expect(settings().labName).toBe('Laboratorio clínico');
      expect(screen.queryByText('Ajustes guardados')).not.toBeInTheDocument();
    });

    it('requires critical days to be lower than warning days', async () => {
      const user = userEvent.setup();
      renderPage();
      const critical = screen.getByLabelText('Días para estado crítico');
      await user.clear(critical);
      await user.type(critical, '90');
      await user.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
      expect(
        screen.getByText('Los días de advertencia deben ser más que los días críticos.'),
      ).toBeInTheDocument();
      expect(settings().criticalDays).toBe(30);
    });

    it('shows the new stored values after a restore or reset', () => {
      renderPage();
      const next = dataset();
      next.settings.labName = 'Otro lab';
      setData(next);
      expect(screen.getByLabelText('Nombre del laboratorio')).toHaveValue('Otro lab');
    });
  });

  describe('simulated date', () => {
    it('activates, warns and goes back to the real date', async () => {
      const user = userEvent.setup();
      renderPage();
      const useReal = screen.getByRole('button', { name: 'Usar la fecha real' });
      expect(useReal).toBeDisabled();
      expect(screen.queryByText('Fecha simulada activa')).not.toBeInTheDocument();

      await user.type(screen.getByLabelText('Fecha simulada'), '2026-12-25');
      expect(settings().todayOverride).toBe('2026-12-25');
      expect(screen.getByText('Fecha simulada activa')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('25');

      await user.click(screen.getByRole('button', { name: 'Usar la fecha real' }));
      expect(settings().todayOverride).toBeUndefined();
      expect(screen.getByLabelText('Fecha simulada')).toHaveValue('');
      expect(screen.queryByText('Fecha simulada activa')).not.toBeInTheDocument();
    });

    it('treats a cleared field as the real date', async () => {
      const user = userEvent.setup();
      setData({ ...dataset(), settings: { ...settings(), todayOverride: '2026-12-25' } });
      renderPage();
      expect(screen.getByLabelText('Fecha simulada')).toHaveValue('2026-12-25');
      await user.clear(screen.getByLabelText('Fecha simulada'));
      expect(settings().todayOverride).toBeUndefined();
    });
  });

  describe('backup', () => {
    it('downloads a JSON file named with today and version 1', async () => {
      const user = userEvent.setup();
      setData({ ...dataset(), settings: { ...settings(), todayOverride: '2026-12-25' } });
      let blob: Blob | undefined;
      Object.assign(URL, {
        createObjectURL: vi.fn((value: Blob) => {
          blob = value;
          return 'blob:respaldo';
        }),
        revokeObjectURL: vi.fn(),
      });
      let downloadName = '';
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        downloadName = this.download;
      });
      renderPage();
      await user.click(screen.getByRole('button', { name: 'Descargar respaldo (JSON)' }));

      expect(downloadName).toBe('mi-lab-respaldo-2026-12-25.json');
      expect(blob?.type).toBe('application/json');
      const parsed = JSON.parse(await blob!.text()) as InventoryData;
      expect(parsed.version).toBe(1);
      expect(parsed.products).toHaveLength(1);
      await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:respaldo'));
    });

    it('restores a valid backup after confirmation', async () => {
      const user = userEvent.setup();
      renderPage();
      const backup = dataset();
      backup.settings.labName = 'Del respaldo';
      backup.products.push({ id: 'p9', name: 'Urea', areaId: 'a1', unit: 'prueba' });
      await user.upload(screen.getByLabelText('Archivo de respaldo'), backupFile(backup));

      const alert = await screen.findByRole('alertdialog', { name: '¿Restaurar este respaldo?' });
      expect(settings().labName).toBe('Laboratorio clínico'); // nothing replaced yet
      await user.click(within(alert).getByRole('button', { name: 'Restaurar' }));

      expect(settings().labName).toBe('Del respaldo');
      expect(useInventoryStore.getState().data.products).toHaveLength(2);
      expect(screen.getByText('Respaldo restaurado')).toBeInTheDocument();
    });

    it('keeps the data when the confirmation is cancelled', async () => {
      const user = userEvent.setup();
      renderPage();
      const backup = dataset();
      backup.settings.labName = 'Del respaldo';
      await user.upload(screen.getByLabelText('Archivo de respaldo'), backupFile(backup));
      const alert = await screen.findByRole('alertdialog');
      await user.click(within(alert).getByRole('button', { name: 'Cancelar' }));
      expect(settings().labName).toBe('Laboratorio clínico');
    });

    it('explains a backup of another version and changes nothing', async () => {
      const user = userEvent.setup();
      renderPage();
      const before = useInventoryStore.getState().data;
      await user.upload(
        screen.getByLabelText('Archivo de respaldo'),
        backupFile({ ...dataset(), version: 9 }),
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Versión de respaldo no compatible (9)',
      );
      expect(document.querySelector('dialog[open]')).toBeNull();
      expect(useInventoryStore.getState().data).toBe(before);
    });

    it('rejects a file that is too big without reading it', async () => {
      const user = userEvent.setup();
      renderPage();
      const file = backupFile(dataset());
      Object.defineProperty(file, 'size', { value: 50 * 1024 * 1024 });
      const read = vi.spyOn(FileReader.prototype, 'readAsText');
      await user.upload(screen.getByLabelText('Archivo de respaldo'), file);
      expect(await screen.findByRole('alert')).toHaveTextContent(/demasiado grande/);
      expect(read).not.toHaveBeenCalled();
      read.mockRestore();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('explains a hostile backup with a negative balance', async () => {
      const user = userEvent.setup();
      renderPage();
      const hostile = dataset();
      hostile.movements.push({
        ...hostile.movements[0]!,
        id: 'evil',
        type: 'issue',
        quantity: 1e6,
      });
      await user.upload(screen.getByLabelText('Archivo de respaldo'), backupFile(hostile));
      expect(await screen.findByRole('alert')).toHaveTextContent(/saldo negativo/);
      expect(screen.queryByRole('alertdialog', { name: /Restaurar/ })).not.toBeInTheDocument();
    });

    it('explains a file that is not JSON', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.upload(screen.getByLabelText('Archivo de respaldo'), backupFile('no es json {'));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'El archivo no es un JSON válido.',
      );
    });

    it('resets to the demo data only after confirmation', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole('button', { name: 'Restablecer datos demo' }));
      const alert = screen.getByRole('alertdialog', { name: '¿Restablecer los datos demo?' });
      expect(alert).toHaveAttribute('open');
      await user.click(within(alert).getByRole('button', { name: 'Cancelar' }));
      expect(useInventoryStore.getState().data.products).toHaveLength(1);

      await user.click(screen.getByRole('button', { name: 'Restablecer datos demo' }));
      await user.click(
        within(screen.getByRole('alertdialog', { name: '¿Restablecer los datos demo?' })).getByRole(
          'button',
          { name: 'Restablecer' },
        ),
      );
      await waitFor(() =>
        expect(useInventoryStore.getState().data.products.length).toBeGreaterThan(100),
      );
      expect(screen.getByText('Datos demo restablecidos')).toBeInTheDocument();
    });
  });

  describe('areas', () => {
    const areaRow = (name: string) =>
      screen.getByText(name, { selector: 'span' }).closest('li') as HTMLElement;

    it('lists the areas with their product count', () => {
      renderPage();
      expect(areaRow('Química seca')).toHaveTextContent('1 producto');
      expect(areaRow('Hematología')).toHaveTextContent('0 productos');
    });

    it('adds an area and rejects empty or repeated names', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole('button', { name: 'Agregar área' }));
      expect(screen.getByText('Escribe el nombre del área.')).toBeInTheDocument();

      await user.type(screen.getByLabelText('Nueva área'), 'hematologia');
      await user.click(screen.getByRole('button', { name: 'Agregar área' }));
      expect(screen.getByText('Ya existe un área con ese nombre.')).toBeInTheDocument();
      expect(useInventoryStore.getState().data.areas).toHaveLength(2);

      await user.clear(screen.getByLabelText('Nueva área'));
      await user.type(screen.getByLabelText('Nueva área'), 'Microbiología');
      await user.click(screen.getByRole('button', { name: 'Agregar área' }));
      expect(useInventoryStore.getState().data.areas.map((a) => a.name)).toContain('Microbiología');
      expect(areaRow('Microbiología')).toBeInTheDocument();
      expect(screen.getByLabelText('Nueva área')).toHaveValue('');
    });

    it('renames an area from the sheet and shows duplicate errors', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole('button', { name: 'Renombrar Hematología' }));
      const dialog = screen.getByRole('dialog', { name: 'Renombrar área' });
      const field = within(dialog).getByLabelText('Nombre del área');
      expect(field).toHaveValue('Hematología');

      await user.clear(field);
      await user.type(field, 'quimica seca');
      await user.click(within(dialog).getByRole('button', { name: 'Renombrar' }));
      expect(within(dialog).getByText('Ya existe un área con ese nombre.')).toBeInTheDocument();

      await user.clear(field);
      await user.type(field, 'Banco de sangre');
      await user.click(within(dialog).getByRole('button', { name: 'Renombrar' }));
      expect(useInventoryStore.getState().data.areas[1]!.name).toBe('Banco de sangre');
    });

    it('does not allow removing an area that has products', () => {
      renderPage();
      expect(screen.getByRole('button', { name: 'Eliminar Química seca' })).toBeDisabled();
      expect(useInventoryStore.getState().data.areas).toHaveLength(2);
    });

    it('removes an empty area only after confirmation', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole('button', { name: 'Eliminar Hematología' }));
      const alert = screen.getByRole('alertdialog', { name: '¿Eliminar el área Hematología?' });
      await user.click(within(alert).getByRole('button', { name: 'Cancelar' }));
      expect(useInventoryStore.getState().data.areas).toHaveLength(2);

      await user.click(screen.getByRole('button', { name: 'Eliminar Hematología' }));
      await user.click(
        within(
          screen.getByRole('alertdialog', { name: '¿Eliminar el área Hematología?' }),
        ).getByRole('button', { name: 'Eliminar' }),
      );
      expect(useInventoryStore.getState().data.areas.map((a) => a.id)).toEqual(['a1']);
      expect(screen.getByText('Área eliminada · Hematología')).toBeInTheDocument();
    });
  });
  describe('procedencias', () => {
    it('lists the sources, adds one with the next code and rejects repeated names or codes', async () => {
      const user = userEvent.setup();
      renderPage();
      expect(screen.getByText('GOES')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Agregar procedencia' }));
      expect(screen.getByText('Escribe el nombre de la procedencia.')).toBeInTheDocument();

      await user.type(screen.getByLabelText('Nueva procedencia'), 'goes');
      await user.click(screen.getByRole('button', { name: 'Agregar procedencia' }));
      expect(screen.getByText('Ya existe una procedencia con ese nombre.')).toBeInTheDocument();

      await user.clear(screen.getByLabelText('Nueva procedencia'));
      await user.type(screen.getByLabelText('Nueva procedencia'), 'Donación');
      await user.type(screen.getByLabelText('Código (opcional)'), '1');
      await user.click(screen.getByRole('button', { name: 'Agregar procedencia' }));
      expect(screen.getByText('Ya existe una procedencia con ese código.')).toBeInTheDocument();

      await user.clear(screen.getByLabelText('Código (opcional)'));
      await user.click(screen.getByRole('button', { name: 'Agregar procedencia' }));
      expect(useInventoryStore.getState().data.fundingSources).toContainEqual({
        code: 2,
        name: 'Donación',
      });
      expect(screen.getByLabelText('Nueva procedencia')).toHaveValue('');
    });

    it('renames and removes an unused source', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole('button', { name: 'Renombrar GOES' }));
      const dialog = screen.getByRole('dialog', { name: 'Renombrar procedencia' });
      const field = within(dialog).getByLabelText('Nombre de la procedencia');
      await user.clear(field);
      await user.type(field, 'MINSAL');
      await user.click(within(dialog).getByRole('button', { name: 'Renombrar' }));
      expect(useInventoryStore.getState().data.fundingSources[0]!.name).toBe('MINSAL');

      await user.click(screen.getByRole('button', { name: 'Eliminar MINSAL' }));
      await user.click(
        within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }),
      );
      expect(useInventoryStore.getState().data.fundingSources).toHaveLength(0);
    });
  });
});
