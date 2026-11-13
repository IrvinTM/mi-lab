type CryptoLike = Partial<Pick<Crypto, 'randomUUID' | 'getRandomValues'>>;

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

/** RFC 4122 version 4 UUID from 16 random bytes. */
function uuidFromBytes(bytes: Uint8Array): string {
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10xx
  const h = Array.from(bytes, (byte) => HEX[byte]!);
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h
    .slice(8, 10)
    .join('')}-${h.slice(10, 16).join('')}`;
}

/**
 * A new random id (UUID v4). `crypto.randomUUID()` only exists in secure contexts (HTTPS or
 * localhost): opening the app by `http://<LAN IP>` or an http tunnel would make every action
 * fail. `crypto.getRandomValues()` exists everywhere, so it is the fallback; `Math.random()` is
 * the last resort for environments without Web Crypto (ids only need to be unique, not secret).
 */
export function newId(source: CryptoLike | undefined = globalThis.crypto): string {
  if (typeof source?.randomUUID === 'function') return source.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof source?.getRandomValues === 'function') source.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return uuidFromBytes(bytes);
}
