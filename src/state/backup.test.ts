import { sampleData } from '@/test/fixtures';
import { MAX_BACKUP_BYTES, backupFileError, checkBackup } from './backup';

describe('checkBackup', () => {
  it('accepts a valid backup and returns the parsed JSON', () => {
    const result = checkBackup(JSON.stringify(sampleData()));
    expect(result).toEqual({ ok: true, json: JSON.parse(JSON.stringify(sampleData())) });
  });

  it('explains text that is not JSON', () => {
    expect(checkBackup('{nope')).toEqual({ ok: false, error: 'El archivo no es un JSON válido.' });
  });

  it('explains a JSON that is not a usable backup', () => {
    const data = sampleData();
    data.lots[0]!.expiryDate = '31/12/2027';
    expect(checkBackup(JSON.stringify(data))).toEqual({
      ok: false,
      error: 'Lote n.º 1: "expiryDate" no es una fecha válida (AAAA-MM-DD).',
    });
  });
});

describe('backupFileError', () => {
  it('accepts files up to the limit', () => {
    expect(backupFileError({ size: 1 })).toBeUndefined();
    expect(backupFileError({ size: MAX_BACKUP_BYTES })).toBeUndefined();
  });

  it('rejects empty and oversized files', () => {
    expect(backupFileError({ size: 0 })).toBe('El archivo está vacío.');
    expect(backupFileError({ size: MAX_BACKUP_BYTES + 1 })).toMatch(/máximo 20 MB/);
  });
});
