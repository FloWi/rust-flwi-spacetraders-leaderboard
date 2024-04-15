import {flexRender, Table} from "@tanstack/react-table";

export function prettyTable<T>(table: Table<T>) {
  let prettyTable = <table>
    <thead>
    {table.getHeaderGroups().map(headerGroup => (
      <tr key={headerGroup.id}>
        {headerGroup.headers.map(header => {
          return (
            <th key={header.id} colSpan={header.colSpan}
                align={(header.column.columnDef.meta as any)?.align}
                style={{width: `${header.getSize()}px`}}
            >
              {header.isPlaceholder ? null : (
                <div
                  className={
                    header.column.getCanSort()
                      ? 'cursor-pointer select-none'
                      : ''
                  }
                  onClick={header.column.getToggleSortingHandler()}
                  title={
                    header.column.getCanSort()
                      ? header.column.getNextSortingOrder() === 'asc'
                        ? 'Sort ascending'
                        : header.column.getNextSortingOrder() === 'desc'
                          ? 'Sort descending'
                          : 'Clear sort'
                      : undefined
                  }
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext()
                  )}
                  {{
                    asc: ' 🔼',
                    desc: ' 🔽',
                  }[header.column.getIsSorted() as string] ?? null}
                </div>
              )}
            </th>
          )
        })}
      </tr>
    ))}
    </thead>
    <tbody>
    {table
      .getRowModel()
      .rows
      .map(row => {
        return (
          <tr key={row.id}
              className={row.getIsSelected() ? 'selected' : undefined}
              onClick={row.getToggleSelectedHandler()}
          >
            {row.getVisibleCells().map(cell => {
              return (
                <td key={cell.id}
                    align={(cell.column.columnDef.meta as any)?.align}>
                  {flexRender(
                    cell.column.columnDef.cell,
                    cell.getContext()
                  )}
                </td>
              )
            })}
          </tr>
        )
      })}
    </tbody>
  </table>;
  return prettyTable;
}
