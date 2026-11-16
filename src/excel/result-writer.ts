import * as XLSX from 'xlsx';
import type { RowResult } from '@shared/types';
import { DUPLICATE_SEPARATOR } from '@shared/constants';
import type { ParsedWorkbook } from './excel-types';
import { dedupeAndSortDuplicates } from '@matching/dedupe';

/**
 * Patch ONLY the assignment_id_duplicate (X) and nama_duplicate (Y) columns on the
 * original worksheet, leaving every other cell / formula / style intact.
 *
 * Invariants (IMPLEMENTATION_PLAN.md §28, §46):
 *   - never delete/rename sheets, remove columns, sort rows, or modify non-output cells;
 *   - DONE rows write ids + names; NO_MATCH/ERROR/MANUAL_REVIEW/SKIPPED write blanks;
 *   - never write "NONE"/"TIDAK ADA"/"ERROR" into output cells.
 *
 * We patch in place on the ParsedWorkbook's sheet (which was loaded from the original
 * bytes), then the caller re-serializes the whole workbook → preserves structure.
 */
export function writeResultsToWorkbook(
  parsed: ParsedWorkbook,
  results: RowResult[],
  separator: string = DUPLICATE_SEPARATOR,
): void {
  const { sheet, headers } = parsed;
  const dupIdsCol = headers['assignment_id_duplicate'];
  const dupNamesCol = headers['nama_duplicate'];

  if (dupIdsCol === undefined || dupNamesCol === undefined) {
    throw new Error('EXCEL_HEADER_MISSING: output columns not found');
  }

  // Index results by their sheet row number for O(1) lookup.
  const byRow = new Map<number, RowResult>();
  for (const r of results) byRow.set(r.rowNumber, r);

  for (const [rowNumber, result] of byRow) {
    const r = rowNumber - 1; // 0-indexed for XLSX cell addressing
    const idsAddr = XLSX.utils.encode_cell({ r, c: dupIdsCol });
    const namesAddr = XLSX.utils.encode_cell({ r, c: dupNamesCol });

    if (result.status === 'DONE' && result.duplicates.length > 0) {
      const sorted = dedupeAndSortDuplicates(result.duplicates);
      sheet[idsAddr] = { t: 's', v: sorted.map((d) => d.assignmentId).join(separator) };
      sheet[namesAddr] = { t: 's', v: sorted.map((d) => d.candidateName).join(separator) };
    } else {
      // No match / error / manual review / skipped → blank output (NEVER a sentinel string).
      sheet[idsAddr] = { t: 's', v: '' };
      sheet[namesAddr] = { t: 's', v: '' };
    }
  }
}

/**
 * Serialize the patched workbook back to an ArrayBuffer (XLSX) preserving the original
 * structure as faithfully as SheetJS allows.
 */
export function serializeWorkbook(parsed: ParsedWorkbook): ArrayBuffer {
  // `bookVBA` + `cellStyles` retained where possible; `compression` keeps file lean.
  const out = XLSX.write(parsed.workbook, {
    type: 'array',
    bookType: 'xlsx',
    cellStyles: true,
    cellDates: true,
  });
  return out as ArrayBuffer;
}
