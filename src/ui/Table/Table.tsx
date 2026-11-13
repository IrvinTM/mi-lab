import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';

export type SortDirection = 'ascending' | 'descending';

export interface TableSort {
  key: string;
  direction: SortDirection;
}

export interface TableColumn<Row> {
  /** Unique within the table; identifies the column in `sort` and `onSortChange`. */
  key: string;
  /** Column heading (Spanish, noun phrase). */
  header: string;
  cell: (row: Row) => ReactNode;
  /** Defaults to `end` for numeric columns and `start` otherwise. */
  align?: 'start' | 'center' | 'end';
  /** Tabular figures and end alignment by default. */
  numeric?: boolean;
  sortable?: boolean;
  className?: string;
}

export interface TableProps<Row> {
  /** Accessible name of the table. Not rendered visually. */
  caption: string;
  columns: readonly TableColumn<Row>[];
  rows: readonly Row[];
  getRowKey: (row: Row) => string;
  /** Current sort. The table only displays and requests sorting: sort `rows` yourself. */
  sort?: TableSort | null;
  /** Clicking a sortable heading: new column → ascending; same column → toggles direction. */
  onSortChange?: (sort: TableSort) => void;
  /** Makes whole rows clickable (mouse, Enter and Space). */
  onRowClick?: (row: Row) => void;
  /** Shown in place of the rows when `rows` is empty. */
  empty?: ReactNode;
}

const alignClass = { start: 'text-start', center: 'text-center', end: 'text-end' } as const;
const justifyClass = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
} as const;

const INTERACTIVE = 'a,button,input,select,textarea,summary,[role="button"],[role="link"]';

function resolveAlign<Row>(column: TableColumn<Row>) {
  return column.align ?? (column.numeric ? 'end' : 'start');
}

export function Table<Row>({
  caption,
  columns,
  rows,
  getRowKey,
  sort,
  onSortChange,
  onRowClick,
  empty,
}: TableProps<Row>) {
  const toggleSort = (column: TableColumn<Row>) => {
    const direction: SortDirection =
      sort?.key === column.key && sort.direction === 'ascending' ? 'descending' : 'ascending';
    onSortChange?.({ key: column.key, direction });
  };

  // Ignore events that come from controls inside a cell (links, buttons…): they handle themselves.
  const fromNestedControl = (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
    const control = (event.target as HTMLElement).closest(INTERACTIVE);
    return control !== null && control !== event.currentTarget;
  };

  return (
    <div className="overflow-x-auto rounded-md bg-bg-elevated">
      <table className="w-full border-collapse text-body text-label">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => {
              const align = resolveAlign(column);
              const sorted = sort?.key === column.key ? sort.direction : null;
              const sortable = column.sortable === true;
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={sortable ? (sorted ?? 'none') : undefined}
                  className={`p-0 text-footnote font-[600] text-label-secondary ${alignClass[align]}`}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column)}
                      className={`flex min-h-11 w-full cursor-pointer items-center gap-1 px-4 text-footnote font-[600] hover:text-label focus-visible:text-label -outline-offset-3 ${justifyClass[align]}`}
                    >
                      {column.header}
                      {sorted === 'ascending' ? (
                        <ArrowUp aria-hidden="true" size={14} />
                      ) : sorted === 'descending' ? (
                        <ArrowDown aria-hidden="true" size={14} />
                      ) : (
                        <ChevronsUpDown
                          aria-hidden="true"
                          size={14}
                          className="text-label-tertiary"
                        />
                      )}
                    </button>
                  ) : (
                    <div className={`flex min-h-11 items-center px-4 ${justifyClass[align]}`}>
                      {column.header}
                    </div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && empty ? (
            <tr className="border-t border-separator">
              <td colSpan={columns.length} className="px-4 py-8 text-center text-label-secondary">
                {empty}
              </td>
            </tr>
          ) : null}
          {rows.map((row) => (
            <tr
              key={getRowKey(row)}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={
                onRowClick
                  ? (event) => {
                      if (!fromNestedControl(event)) onRowClick(row);
                    }
                  : undefined
              }
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (
                        (event.key === 'Enter' || event.key === ' ') &&
                        !fromNestedControl(event)
                      ) {
                        event.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              className={`border-t border-separator ${
                onRowClick
                  ? 'cursor-pointer transition-colors duration-150 hover:bg-fill focus-visible:bg-fill -outline-offset-3'
                  : ''
              }`}
            >
              {columns.map((column) => {
                const align = resolveAlign(column);
                return (
                  <td
                    key={column.key}
                    className={`px-4 py-3 align-middle ${alignClass[align]} ${
                      column.numeric ? 'tabular-nums' : ''
                    } ${column.className ?? ''}`}
                  >
                    {column.cell(row)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
