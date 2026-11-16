import type * as XLSX from 'xlsx';

/** Header name → column index (0-based) on the active sheet. */
export type HeaderMap = Record<string, number>;

export interface ParsedWorkbook {
  workbook: XLSX.WorkBook;
  /** The sheet name selected for target extraction (e.g. "Sheet2"). */
  sheetName: string;
  /** Active worksheet object. */
  sheet: XLSX.WorkSheet;
  /** Header name → column index. */
  headers: HeaderMap;
  /** Number of data rows (excluding header). */
  rowCount: number;
  /** The original ArrayBuffer for preservation on export. */
  originalBytes: ArrayBuffer;
}

export interface ExcelParseError {
  code: 'EXCEL_INVALID' | 'EXCEL_HEADER_MISSING';
  message: string;
  missingHeaders?: string[];
}
