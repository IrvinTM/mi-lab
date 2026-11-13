/** Spanish plural of a noun: prueba → pruebas, unidad → unidades, mes → meses. */
export function pluralEs(noun: string, count: number): string {
  if (count === 1) return noun;
  return /[aeiouáéíóú]$/i.test(noun) ? `${noun}s` : `${noun}es`;
}

/** "1 prueba", "48 pruebas". */
export function countNoun(count: number, noun: string): string {
  return `${count} ${pluralEs(noun, count)}`;
}
