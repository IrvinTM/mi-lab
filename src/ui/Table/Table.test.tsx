import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Table, type TableColumn, type TableSort } from './Table';

interface Product {
  id: string;
  name: string;
  stock: number;
}

const products: Product[] = [
  { id: 'a', name: 'Glucosa', stock: 48 },
  { id: 'b', name: 'Urea', stock: 12 },
];

const columns: TableColumn<Product>[] = [
  { key: 'name', header: 'Producto', cell: (p) => p.name, sortable: true },
  { key: 'stock', header: 'Saldo', cell: (p) => p.stock, numeric: true, sortable: true },
  { key: 'code', header: 'Código', cell: (p) => p.id.toUpperCase() },
];

describe('Table', () => {
  it('renders caption, headings and cells', () => {
    render(<Table caption="Productos" columns={columns} rows={products} getRowKey={(p) => p.id} />);
    expect(screen.getByRole('table', { name: 'Productos' })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Producto',
      'Saldo',
      'Código',
    ]);
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getByRole('cell', { name: 'Glucosa' })).toBeInTheDocument();
  });

  it('aligns numeric columns to the end with tabular figures', () => {
    render(<Table caption="Productos" columns={columns} rows={products} getRowKey={(p) => p.id} />);
    const cell = screen.getByRole('cell', { name: '48' });
    expect(cell).toHaveClass('text-end', 'tabular-nums');
    expect(screen.getByRole('cell', { name: 'Glucosa' })).toHaveClass('text-start');
  });

  it('sets aria-sort only on sortable columns', () => {
    render(
      <Table
        caption="Productos"
        columns={columns}
        rows={products}
        getRowKey={(p) => p.id}
        sort={{ key: 'stock', direction: 'descending' }}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Saldo' })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    expect(screen.getByRole('columnheader', { name: 'Producto' })).toHaveAttribute(
      'aria-sort',
      'none',
    );
    expect(screen.getByRole('columnheader', { name: 'Código' })).not.toHaveAttribute('aria-sort');
    expect(
      within(screen.getByRole('columnheader', { name: 'Código' })).queryByRole('button'),
    ).not.toBeInTheDocument();
  });

  it('requests ascending on a new column and toggles direction on the same one', async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    const { rerender } = render(
      <Table
        caption="Productos"
        columns={columns}
        rows={products}
        getRowKey={(p) => p.id}
        sort={null}
        onSortChange={onSortChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Producto' }));
    expect(onSortChange).toHaveBeenLastCalledWith({ key: 'name', direction: 'ascending' });

    rerender(
      <Table
        caption="Productos"
        columns={columns}
        rows={products}
        getRowKey={(p) => p.id}
        sort={{ key: 'name', direction: 'ascending' }}
        onSortChange={onSortChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Producto' }));
    expect(onSortChange).toHaveBeenLastCalledWith({ key: 'name', direction: 'descending' });
  });

  it('updates aria-sort when used controlled', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [sort, setSort] = useState<TableSort | null>(null);
      return (
        <Table
          caption="Productos"
          columns={columns}
          rows={products}
          getRowKey={(p) => p.id}
          sort={sort}
          onSortChange={setSort}
        />
      );
    }
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Saldo' }));
    expect(screen.getByRole('columnheader', { name: 'Saldo' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  it('makes whole rows clickable with mouse, Enter and Space', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(
      <Table
        caption="Productos"
        columns={columns}
        rows={products}
        getRowKey={(p) => p.id}
        onRowClick={onRowClick}
      />,
    );
    await user.click(screen.getByRole('cell', { name: 'Urea' }));
    expect(onRowClick).toHaveBeenLastCalledWith(products[1]);

    const firstRow = screen.getAllByRole('row')[1]!;
    expect(firstRow).toHaveAttribute('tabindex', '0');
    firstRow.focus();
    await user.keyboard('{Enter}');
    expect(onRowClick).toHaveBeenLastCalledWith(products[0]);
    await user.keyboard(' ');
    expect(onRowClick).toHaveBeenCalledTimes(3);
  });

  it('does not trigger the row click from a control inside a cell', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    const onAction = vi.fn();
    const withAction: TableColumn<Product>[] = [
      ...columns,
      {
        key: 'action',
        header: 'Acción',
        cell: (p) => (
          <button type="button" onClick={() => onAction(p.id)}>
            Salida {p.id}
          </button>
        ),
      },
    ];
    render(
      <Table
        caption="Productos"
        columns={withAction}
        rows={products}
        getRowKey={(p) => p.id}
        onRowClick={onRowClick}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Salida a' }));
    expect(onAction).toHaveBeenCalledWith('a');
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('rows are not focusable without onRowClick', () => {
    render(<Table caption="Productos" columns={columns} rows={products} getRowKey={(p) => p.id} />);
    expect(screen.getAllByRole('row')[1]).not.toHaveAttribute('tabindex');
  });

  it('shows the empty state only when there are no rows', () => {
    const { rerender } = render(
      <Table
        caption="Productos"
        columns={columns}
        rows={[]}
        getRowKey={(p) => p.id}
        empty="Sin productos"
      />,
    );
    expect(screen.getByText('Sin productos')).toBeInTheDocument();
    expect(screen.getByRole('cell')).toHaveAttribute('colspan', '3');

    rerender(
      <Table
        caption="Productos"
        columns={columns}
        rows={products}
        getRowKey={(p) => p.id}
        empty="Sin productos"
      />,
    );
    expect(screen.queryByText('Sin productos')).not.toBeInTheDocument();
  });

  describe('horizontal scroll on narrow screens', () => {
    beforeEach(() => {
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(private readonly callback: () => void) {}
          observe() {
            this.callback();
          }
          disconnect() {}
        },
      );
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      // jsdom defines scrollWidth on Element.prototype; drop the override.
      delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
    });

    it('is a named, focusable region only while it overflows', () => {
      Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
        configurable: true,
        get: () => 800,
      });
      render(<Table caption="Lotes" columns={columns} rows={products} getRowKey={(p) => p.id} />);
      const region = screen.getByRole('region', { name: 'Lotes' });
      expect(region).toHaveAttribute('tabindex', '0');
    });

    it('adds no Tab stop when the table fits', () => {
      render(<Table caption="Lotes" columns={columns} rows={products} getRowKey={(p) => p.id} />);
      expect(screen.queryByRole('region')).not.toBeInTheDocument();
    });
  });

  it('memoizes rows: re-rendering with the same rows and columns does not render the cells again', () => {
    const cell = vi.fn((p: Product) => p.name);
    const memoColumns: TableColumn<Product>[] = [{ key: 'name', header: 'Producto', cell }];
    const onRowClick = vi.fn();
    const { rerender } = render(
      <Table
        caption="Productos"
        columns={memoColumns}
        rows={products}
        getRowKey={(p) => p.id}
        onRowClick={onRowClick}
      />,
    );
    expect(cell).toHaveBeenCalledTimes(2);

    rerender(
      <Table
        caption="Productos"
        columns={memoColumns}
        rows={products}
        getRowKey={(p) => p.id}
        onRowClick={onRowClick}
      />,
    );
    expect(cell).toHaveBeenCalledTimes(2);

    // Only the changed row renders again.
    rerender(
      <Table
        caption="Productos"
        columns={memoColumns}
        rows={[products[0]!, { ...products[1]!, name: 'Urea BUN' }]}
        getRowKey={(p) => p.id}
        onRowClick={onRowClick}
      />,
    );
    expect(cell).toHaveBeenCalledTimes(3);
    expect(screen.getByRole('cell', { name: 'Urea BUN' })).toBeInTheDocument();
  });
});
