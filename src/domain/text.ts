/** Lowercase, accent-free, trimmed text for case- and accent-insensitive matching ("Ácido" = "acido"). */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .trim();
}
