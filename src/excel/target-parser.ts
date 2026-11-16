import * as XLSX from 'xlsx';
import type { TargetRow } from '@shared/types';
import { REQUIRED_HEADERS, OPTIONAL_HEADERS } from '@shared/config';
import { DUPLICATE_SEPARATOR } from '@shared/constants';
import type { HeaderMap, ParsedWorkbook, ExcelParseError } from './excel-types';
import { AutomationError } from '@core/errors';

/**
 * Parse the first row as headers and map header-name → column index.
 * Per IMPLEMENTATION_PLAN.md §10.3: never hardcode column letters; resolve by header NAME.
 */
export function buildHeaderMap(sheet: XLSX.WorkSheet): HeaderMap {
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
  const headers: HeaderMap = {};
  const row = range.s.r; // header row (row 0 in 0-indexed = sheet row 1)
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: row, c });
    const cell = sheet[addr];
    const name = cell && cell.v !== undefined ? String(cell.v).trim() : '';
    if (name) {
      // Last occurrence wins if a header repeats (rare); store lowercased key too.
      headers[name.toLowerCase()] = c;
      headers[name] = c;
    }
  }
  return headers;
}

/** Validate that all required headers exist in the map. */
export function validateHeaders(headers: HeaderMap): ExcelParseError | null {
  const missing: string[] = [];
  for (const h of REQUIRED_HEADERS) {
    if (headers[h.toLowerCase()] === undefined) missing.push(h);
  }
  if (missing.length > 0) {
    return {
      code: 'EXCEL_HEADER_MISSING',
      message: `Required headers not found: ${missing.join(', ')}`,
      missingHeaders: missing,
    };
  }
  return null;
}

/**
 * Read a cell value as a trimmed string (handles numbers/dates by coercing to string).
 */
function cellString(sheet: XLSX.WorkSheet, row: number, col: number): string {
  const addr = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = sheet[addr];
  if (!cell || cell.v === undefined || cell.v === null) return '';
  if (cell.t === 'd' && cell.v instanceof Date) return cell.v.toISOString();
  return String(cell.v).trim();
}

/**
 * Extract target rows: a row is a TargetRow iff data1 != blank AND code_identity != blank.
 * Rows with pre-existing assignment_id_duplicate output are skipped by default unless
 * `reprocessCompleted` is set (IMPLEMENTATION_PLAN.md §2.1, §27).
 */
export function parseTargetRows(parsed: ParsedWorkbook, opts: { reprocessCompleted?: boolean } = {}): TargetRow[] {
  const { sheet, headers } = parsed;
  const data1Col = headers['data1'];
  const codeCol = headers['code_identity'];
  const dupIdsCol = headers['assignment_id_duplicate'];
  const dupNamesCol = headers['nama_duplicate'];
  const assignmentIdCol = headers['assignment_id'];

  if (data1Col === undefined || codeCol === undefined) {
    throw new AutomationError('EXCEL_HEADER_MISSING', 'data1 or code_identity header missing');
  }

  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
  const targets: TargetRow[] = [];

  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const data1 = cellString(sheet, r, data1Col);
    const codeIdentity = cellString(sheet, r, codeCol);

    if (!data1 || !codeIdentity) continue; // not a target row

    const existingIds = dupIdsCol !== undefined ? cellString(sheet, r, dupIdsCol) : '';
    const existingNames = dupNamesCol !== undefined ? cellString(sheet, r, dupNamesCol) : '';

    // Skip rows that already have output unless reprocess is enabled.
    if (!opts.reprocessCompleted && existingIds) {
      continue;
    }

    targets.push({
      rowNumber: r + 1, // convert to 1-based sheet row
      ...(assignmentIdCol !== undefined && cellString(sheet, r, assignmentIdCol)
        ? { assignmentIdOriginal: cellString(sheet, r, assignmentIdCol) }
        : {}),
      data1,
      codeIdentity,
      ...(existingIds ? { existingDuplicateIds: existingIds } : {}),
      ...(existingNames ? { existingDuplicateNames: existingNames } : {}),
    });
  }

  return targets;
}

/** Split a stored `assignment_id_duplicate` cell back into individual UUIDs. */
export function splitExistingIds(cell: string | undefined, separator = DUPLICATE_SEPARATOR): string[] {
  if (!cell) return [];
  return cell
    .split(separator)
    .map((s) => s.trim())
    .filter(Boolean);
}

export { OPTIONAL_HEADERS };
