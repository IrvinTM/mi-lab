// STUB (T8.4): the real implementation comes from T8.3 and replaces this file on merge.
import type { ReportData } from '@/domain/report';
import type { ISODate } from '@/domain/types';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function buildReportWorkbook(_report: ReportData): Promise<Uint8Array> {
  throw new Error('pendiente T8.3');
}

export function reportFileName(from: ISODate, to: ISODate): string {
  return `mi-lab-informe-${from}_${to}.xlsx`;
}
