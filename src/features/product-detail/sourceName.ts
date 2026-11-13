import type { FundingSource } from '@/domain/types';
import { EMPTY } from '@/lib/format';

/** Funding source name for a code; "—" when the movement or lot has no source. */
export function sourceName(sources: readonly FundingSource[], code: number | undefined): string {
  if (code === undefined) return EMPTY;
  return sources.find((source) => source.code === code)?.name ?? `Procedencia ${code}`;
}
