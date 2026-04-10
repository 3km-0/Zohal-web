'use client';

import { useEffect, useMemo, useState } from 'react';
import { Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';

type TabularHighlight = {
  sheetName?: string;
  rangeRef?: string;
  cellRef?: string;
};

type TabularCell = {
  row_index: number;
  column_index: number;
  column_key: string;
  cell_ref: string;
  formatted_value: string;
  formula?: string | null;
};

type TabularRow = {
  row_index: number;
  range_ref: string;
  values: Record<string, string>;
  cells: TabularCell[];
};

type TabularSheet = {
  sheet_name: string;
  inferred_header: string[];
  rows: TabularRow[];
};

type TabularManifest = {
  schema_version: string;
  source_format: 'xlsx' | 'csv';
  sheet_order: string[];
  sheets: TabularSheet[];
  stats: {
    sheet_count: number;
    row_count: number;
    cell_count: number;
  };
};

interface SpreadsheetViewerProps {
  manifestUrl: string;
  highlight?: TabularHighlight;
}

export function SpreadsheetViewer({ manifestUrl, highlight }: SpreadsheetViewerProps) {
  const [manifest, setManifest] = useState<TabularManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSheetName, setSelectedSheetName] = useState<string | null>(null);
  const [selectedCellRef, setSelectedCellRef] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(manifestUrl, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load spreadsheet (${response.status})`);
        }
        return response.json();
      })
      .then((data: TabularManifest) => {
        if (cancelled) return;
        setManifest(data);
        setSelectedSheetName(highlight?.sheetName || data.sheet_order[0] || data.sheets[0]?.sheet_name || null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load spreadsheet');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [manifestUrl, highlight?.sheetName]);

  useEffect(() => {
    if (highlight?.sheetName) {
      setSelectedSheetName(highlight.sheetName);
    }
    if (highlight?.cellRef) {
      setSelectedCellRef(highlight.cellRef);
    }
  }, [highlight?.sheetName, highlight?.cellRef]);

  const selectedSheet = useMemo(
    () => manifest?.sheets.find((sheet) => sheet.sheet_name === selectedSheetName) || manifest?.sheets[0] || null,
    [manifest, selectedSheetName]
  );

  const selectedCell = useMemo(() => {
    if (!selectedSheet || !selectedCellRef) return null;
    return selectedSheet.rows.flatMap((row) => row.cells).find((cell) => cell.cell_ref === selectedCellRef) || null;
  }, [selectedSheet, selectedCellRef]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !manifest || !selectedSheet) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-text-soft">
        {error || 'Spreadsheet preview unavailable'}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="border-b border-border px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {manifest.sheets.map((sheet) => (
            <button
              key={sheet.sheet_name}
              type="button"
              onClick={() => setSelectedSheetName(sheet.sheet_name)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm transition-colors',
                sheet.sheet_name === selectedSheet.sheet_name
                  ? 'border-accent bg-accent/10 text-text'
                  : 'border-border bg-surface-alt text-text-soft hover:text-text'
              )}
            >
              {sheet.sheet_name}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-text-soft">
          {manifest.stats.row_count} rows • {manifest.stats.cell_count} cells
        </p>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-h-0 overflow-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr>
                <th className="border-b border-border bg-surface-alt px-3 py-2 text-left text-xs font-semibold text-text-soft">
                  #
                </th>
                {selectedSheet.inferred_header.map((header) => (
                  <th
                    key={header}
                    className="border-b border-border bg-surface-alt px-3 py-2 text-left text-xs font-semibold text-text-soft"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {selectedSheet.rows.map((row) => {
                const isHighlightedRow =
                  highlight?.sheetName === selectedSheet.sheet_name &&
                  highlight?.rangeRef &&
                  highlight.rangeRef === row.range_ref;
                return (
                  <tr
                    key={row.range_ref}
                    className={cn(isHighlightedRow && 'bg-accent/5')}
                  >
                    <td className="border-b border-border px-3 py-2 align-top text-xs text-text-soft">
                      {row.row_index}
                    </td>
                    {selectedSheet.inferred_header.map((header) => {
                      const cell = row.cells.find((entry) => entry.column_key === header);
                      const isHighlightedCell =
                        highlight?.sheetName === selectedSheet.sheet_name &&
                        ((highlight?.cellRef && highlight.cellRef === cell?.cell_ref) ||
                          (selectedCellRef && selectedCellRef === cell?.cell_ref));
                      return (
                        <td
                          key={`${row.range_ref}-${header}`}
                          className={cn(
                            'border-b border-border px-3 py-2 align-top text-text',
                            isHighlightedCell && 'bg-accent/10 ring-1 ring-inset ring-accent'
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedCellRef(cell?.cell_ref || null)}
                            className="block w-full text-left"
                          >
                            {cell?.formatted_value || '—'}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <aside className="border-t border-border bg-surface-alt/60 p-4 md:border-l md:border-t-0">
          <h2 className="text-sm font-semibold text-text">Cell inspector</h2>
          {selectedCell ? (
            <div className="mt-3 space-y-2 text-sm text-text-soft">
              <p>
                <span className="font-medium text-text">{selectedCell.cell_ref}</span> in{' '}
                <span className="font-medium text-text">{selectedSheet.sheet_name}</span>
              </p>
              <p>{selectedCell.formatted_value || 'Empty cell'}</p>
              {selectedCell.formula ? (
                <div className="rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs text-text">
                  {selectedCell.formula}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-text-soft">
              Select a cell to inspect its value and formula.
            </p>
          )}

          {highlight?.rangeRef ? (
            <div className="mt-4 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-soft">
              Evidence anchor: {highlight.rangeRef}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
