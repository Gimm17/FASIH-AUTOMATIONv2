import * as XLSX from 'xlsx';
import type { RowResult } from '@shared/types';
import { DEFAULT_CONFIG } from '@shared/config';
import { buildHeaderMap, parseTargetRows, validateHeaders } from './target-parser';
import { writeResultsToWorkbook, serializeWorkbook } from './result-writer';
import { AutomationError } from '@core/errors';
import type { ParsedWorkbook, HeaderMap } from './excel-types';

/**
 * Excel adapter entry point. Loads the workbook from an ArrayBuffer, validates headers,
 * and exposes the parsed workbook for target extraction + result patching.
 *
 * IMPLEMENTATION_PLAN.md §10: NEVER convert to CSV. The original ArrayBuffer is retained
 * on the ParsedWorkbook so export round-trips preserve structure/formulas/styles.
 */
export function loadWorkbook(bytes: ArrayBuffer | Uint8Array): ParsedWorkbook {
  const originalBytes = (
    bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  ) as ArrayBuffer;

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(originalBytes, { type: 'array', cellStyles: true, cellDates: true });
  } catch (err) {
    throw new AutomationError('EXCEL_INVALID', err instanceof Error ? err.message : 'failed to read workbook');
  }

  if (!workbook.SheetNames.length) {
    throw new AutomationError('EXCEL_INVALID', 'workbook has no sheets');
  }

  // Pick the sheet: prefer a sheet that contains the required headers.
  let sheetName = workbook.SheetNames[0];
  let sheet = workbook.Sheets[sheetName];
  let headers: HeaderMap = sheet ? buildHeaderMap(sheet) : {};

  const err = validateHeaders(headers);
  if (err) {
    // Try every other sheet for the headers before failing.
    for (const name of workbook.SheetNames) {
      const ws = workbook.Sheets[name];
      if (!ws) continue;
      const hm = buildHeaderMap(ws);
      if (!validateHeaders(hm)) {
        sheetName = name;
        sheet = ws;
        headers = hm;
        break;
      }
    }
    // Re-validate the final selection.
    const finalErr = validateHeaders(headers);
    if (finalErr) {
      throw new AutomationError('EXCEL_HEADER_MISSING', finalErr.message, { missing: finalErr.missingHeaders });
    }
  }

  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
  const rowCount = Math.max(0, range.e.r - range.s.r);

  return { workbook, sheetName, sheet, headers, rowCount, originalBytes };
}

/** Parse targets from an already-loaded workbook (convenience wrapper). */
export function parseTargets(parsed: ParsedWorkbook, reprocessCompleted = DEFAULT_CONFIG.excel.reprocessCompleted) {
  return parseTargetRows(parsed, { reprocessCompleted });
}

/**
 * Build the output file: load original bytes → patch X/Y → serialize.
 * Returns { filename, arrayBuffer }.
 */
export function buildOutputWorkbook(
  originalBytes: ArrayBuffer,
  results: RowResult[],
  sourceFileName: string,
  separator: string = DEFAULT_CONFIG.excel.duplicateSeparator,
): { filename: string; arrayBuffer: ArrayBuffer } {
  const parsed = loadWorkbook(originalBytes);
  writeResultsToWorkbook(parsed, results, separator);
  const arrayBuffer = serializeWorkbook(parsed);
  const base = sourceFileName.replace(/\.xlsx$/i, '');
  const stamp = localStamp();
  return {
    filename: `${base}_HASIL_${stamp}.xlsx`,
    arrayBuffer,
  };
}

/** Local YYYY-MM-DD_HHMM stamp for the output filename. */
function localStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export { writeResultsToWorkbook, serializeWorkbook, buildHeaderMap, parseTargetRows, validateHeaders };
export type { ParsedWorkbook };
