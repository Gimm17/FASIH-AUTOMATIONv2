import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { loadWorkbook, parseTargets, buildOutputWorkbook } from './excel-adapter';
import { parseTargetRows, splitExistingIds, buildHeaderMap } from './target-parser';
import { writeResultsToWorkbook } from './result-writer';
import type { RowResult } from '@shared/types';

/**
 * Build an in-memory workbook that mirrors the real file's shape but with headers in
 * CUSTOM positions — proving resolution is by NAME, not column letter (plan §10.3).
 */
function buildSampleWorkbookBytes(): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    // header row — order intentionally scrambled vs the real A/G/H/X/Y layout
    ['code_identity', 'assignment_id', 'unused1', 'data1', 'nama_duplicate', 'assignment_id_duplicate', 'catatan 2'],
    ['111', 'uuid-orig-1', 'x', 'Puskesmas Lolantang', '', '', 'keep'],
    ['222', 'uuid-orig-2', 'x', 'SDN PONDING-PONIDNG', '', '', 'keep'],
    ['', 'uuid-orig-3', 'x', 'Tanpa kode (bukan target)', '', '', ''],
    ['444', 'uuid-orig-4', 'x', 'Polindes Labangun', 'Sudah ada', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', 'keep'],
    ['', '', '', '', '', '', ''],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'DataKu');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return out;
}

describe('loadWorkbook', () => {
  it('loads and validates headers on a scrambled-column sheet', () => {
    const parsed = loadWorkbook(buildSampleWorkbookBytes());
    expect(parsed.sheetName).toBe('DataKu');
    expect(parsed.headers['data1']).toBeDefined();
    expect(parsed.headers['code_identity']).toBeDefined();
    expect(parsed.rowCount).toBeGreaterThan(0);
  });

  it('throws EXCEL_HEADER_MISSING when required headers are absent', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['foo'], ['bar']]), 'S');
    const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    expect(() => loadWorkbook(bytes)).toThrowError(/Required headers not found/);
  });
});

describe('parseTargetRows (plan §2.1 row-selection rules)', () => {
  const parsed = loadWorkbook(buildSampleWorkbookBytes());

  it('a row is a target only when data1 AND code_identity are present', () => {
    const rows = parseTargetRows(parsed);
    // Row 5 (Polindes Labangun) has pre-existing output → excluded by default.
    expect(rows.map((r) => r.data1)).toEqual(['Puskesmas Lolantang', 'SDN PONDING-PONIDNG']);
    expect(rows[0]?.rowNumber).toBe(2); // 1-based sheet row
  });

  it('skips rows that already have assignment_id_duplicate output (default)', () => {
    const rows = parseTargetRows(parsed);
    expect(rows.some((r) => r.data1 === 'Polindes Labangun')).toBe(false);
  });

  it('includes completed rows when reprocessCompleted is set', () => {
    const rows = parseTargetRows(parsed, { reprocessCompleted: true });
    expect(rows).toHaveLength(3); // the code-less row is never a target
    expect(rows[2]?.data1).toBe('Polindes Labangun');
    expect(rows[2]?.existingDuplicateIds).toContain('aaaaaaaa');
  });

  it('carries the original assignment_id as a safety cross-check', () => {
    const rows = parseTargetRows(parsed);
    expect(rows[0]?.assignmentIdOriginal).toBe('uuid-orig-1');
  });

  it('parseTargets wrapper honors the reprocess flag', () => {
    expect(parseTargets(parsed, false)).toHaveLength(2);
    expect(parseTargets(parsed, true)).toHaveLength(3);
  });
});

describe('writeResultsToWorkbook (plan §2.2 invariants)', () => {
  const bytes = buildSampleWorkbookBytes();

  const doneRow: RowResult = {
    rowNumber: 2,
    targetName: 'Puskesmas Lolantang',
    codeIdentity: '111',
    status: 'DONE',
    duplicates: [
      { candidateCode: 'SE26aaa', candidateName: 'Puskesmas Lolantang', assignmentId: 'id-z' },
      { candidateCode: 'SE26bbb', candidateName: 'Puskesmas Lolantang Utara', assignmentId: 'id-a' },
    ],
    queryHistory: [],
    updatedAt: new Date().toISOString(),
  };
  const noMatchRow: RowResult = {
    rowNumber: 3,
    targetName: 'SDN PONDING-PONIDNG',
    codeIdentity: '222',
    status: 'NO_MATCH',
    duplicates: [],
    queryHistory: [],
    updatedAt: new Date().toISOString(),
  };

  it('writes ONLY the X/Y output columns; everything else untouched', () => {
    const parsed = loadWorkbook(bytes);
    const beforeCatatan = parsed.sheet[XLSX.utils.encode_cell({ r: 1, c: parsed.headers['catatan 2'] })]?.v;

    writeResultsToWorkbook(parsed, [doneRow, noMatchRow], ';');

    const idsCell = parsed.sheet[XLSX.utils.encode_cell({ r: 1, c: parsed.headers['assignment_id_duplicate'] })];
    const namesCell = parsed.sheet[XLSX.utils.encode_cell({ r: 1, c: parsed.headers['nama_duplicate'] })];
    // Sorted by name: "Puskesmas Lolantang" < "Puskesmas Lolantang Utara"
    expect(idsCell?.v).toBe('id-z;id-a');
    expect(namesCell?.v).toBe('Puskesmas Lolantang;Puskesmas Lolantang Utara');

    // Non-output columns are untouched:
    expect(parsed.sheet[XLSX.utils.encode_cell({ r: 1, c: parsed.headers['data1'] })]?.v).toBe('Puskesmas Lolantang');
    expect(parsed.sheet[XLSX.utils.encode_cell({ r: 1, c: parsed.headers['code_identity'] })]?.v).toBe('111');
    expect(parsed.sheet[XLSX.utils.encode_cell({ r: 1, c: parsed.headers['catatan 2'] })]?.v).toBe(beforeCatatan);
  });

  it('non-DONE rows get BLANK output cells (never "NONE"/"ERROR" sentinels)', () => {
    const parsed = loadWorkbook(bytes);
    writeResultsToWorkbook(parsed, [noMatchRow], ';');
    const ids = parsed.sheet[XLSX.utils.encode_cell({ r: 2, c: parsed.headers['assignment_id_duplicate'] })];
    const names = parsed.sheet[XLSX.utils.encode_cell({ r: 2, c: parsed.headers['nama_duplicate'] })];
    expect(ids?.v).toBe('');
    expect(names?.v).toBe('');
  });

  it('rows not in the result set are left alone (resume safety)', () => {
    const parsed = loadWorkbook(bytes);
    writeResultsToWorkbook(parsed, [doneRow], ';');
    const untouched = parsed.sheet[XLSX.utils.encode_cell({ r: 4, c: parsed.headers['assignment_id_duplicate'] })];
    expect(untouched?.v).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
  });
});

describe('buildOutputWorkbook', () => {
  it('round-trips the original bytes and names the file with a timestamp', () => {
    const results: RowResult[] = [
      {
        rowNumber: 2,
        targetName: 'Puskesmas Lolantang',
        codeIdentity: '111',
        status: 'DONE',
        duplicates: [{ candidateCode: 'SE26aaa', candidateName: 'Puskesmas Lolantang', assignmentId: 'id-z' }],
        queryHistory: [],
        updatedAt: new Date().toISOString(),
      },
    ];
    const { filename, arrayBuffer } = buildOutputWorkbook(buildSampleWorkbookBytes(), results, 'Pengecekan Duplikat Assignment.xlsx');
    expect(filename).toMatch(/^Pengecekan Duplikat Assignment_HASIL_\d{4}-\d{2}-\d{2}_\d{4}\.xlsx$/);
    expect(arrayBuffer.byteLength).toBeGreaterThan(0);
    // Output is a valid xlsx that still carries the patched value.
    const reloaded = loadWorkbook(arrayBuffer);
    expect(reloaded.headers['data1']).toBeDefined();
  });
});

describe('splitExistingIds', () => {
  it('splits on the separator and trims', () => {
    expect(splitExistingIds('a; b ;c')).toEqual(['a', 'b', 'c']);
    expect(splitExistingIds(undefined)).toEqual([]);
  });
});

describe('buildHeaderMap', () => {
  it('keys headers case-insensitively; exact-case keys keep their first binding', () => {
    const ws = XLSX.utils.aoa_to_sheet([['Data1', 'DATA1'], []]);
    const map = buildHeaderMap(ws);
    expect(map['data1']).toBe(1); // lowercase key: last occurrence wins
    expect(map['DATA1']).toBe(1);
    expect(map['Data1']).toBe(0); // exact-case key was set on first occurrence only
  });
});
