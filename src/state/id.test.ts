import { newId } from './id';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newId', () => {
  it('uses crypto.randomUUID when available', () => {
    expect(newId({ randomUUID: () => '00000000-0000-4000-8000-000000000000' })).toBe(
      '00000000-0000-4000-8000-000000000000',
    );
    expect(newId()).toMatch(UUID_V4);
  });

  it('falls back to getRandomValues outside secure contexts (no randomUUID)', () => {
    const getRandomValues = vi.fn(<T extends ArrayBufferView | null>(array: T) => {
      (array as unknown as Uint8Array).fill(0xff);
      return array;
    });
    const id = newId({ getRandomValues: getRandomValues as Crypto['getRandomValues'] });
    expect(getRandomValues).toHaveBeenCalledOnce();
    expect(id).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    expect(id).toMatch(UUID_V4);
  });

  it('still produces unique UUIDs without Web Crypto', () => {
    const ids = new Set(Array.from({ length: 1_000 }, () => newId({})));
    expect(ids.size).toBe(1_000);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });

  it('produces unique ids with the real fallback', () => {
    const { getRandomValues } = globalThis.crypto;
    const source = { getRandomValues: getRandomValues.bind(globalThis.crypto) };
    const ids = new Set(Array.from({ length: 1_000 }, () => newId(source)));
    expect(ids.size).toBe(1_000);
  });
});
