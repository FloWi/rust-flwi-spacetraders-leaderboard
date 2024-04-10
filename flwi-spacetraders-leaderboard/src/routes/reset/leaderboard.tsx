import {createFileRoute} from '@tanstack/react-router'
import {ApiLeaderboardEntry, CrateService} from "../../../generated";

import {createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, SortingState, Table, useReactTable,} from '@tanstack/react-table'
import React from "react";
import Plot from 'react-plotly.js';


type LeaderboardSearch = {
  resetDate?: string
}

const columnHelper = createColumnHelper<ApiLeaderboardEntry>()
let numberFmt = new Intl.NumberFormat();

const columns = [
  columnHelper.accessor('agentSymbol', {
    cell: info => info.getValue(),
    footer: info => info.column.id,
  }),
  columnHelper.accessor('credits', {
    cell: info => numberFmt.format(info.getValue()),
    footer: info => info.column.id,
  }),
  columnHelper.accessor('shipCount', {
    cell: info => numberFmt.format(info.getValue()),
    footer: info => info.column.id,
  }),
]

export const Route = createFileRoute('/reset/leaderboard')({
  component: LeaderboardComponent,
  loaderDeps: ({search: {resetDate}}) => ({resetDate}),
  loader: async ({deps: {resetDate}}) => {
    let resetDates = await CrateService.getResetDates();

    let resetDateToUse = resetDate ? resetDate : resetDates.resetDates.toSorted().at(-1);

    let leaderboard = await CrateService.getLeaderboard({resetDate: '2024-03-24'});

    return {resetDateToUse, leaderboard};
  },

  validateSearch: (search: Record<string, unknown>): LeaderboardSearch => {
    // validate and parse the search params into a typed state
    return {
      resetDate: search?.resetDate as string,
    }
  },

})


function prettyTable<T>(table: Table<T>) {
  let prettyTable = <table>
    <thead>
    {table.getHeaderGroups().map(headerGroup => (
      <tr key={headerGroup.id}>
        {headerGroup.headers.map(header => {
          return (
            <th key={header.id} colSpan={header.colSpan}>
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
          <tr key={row.id}>
            {row.getVisibleCells().map(cell => {
              return (
                <td key={cell.id}>
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

function LeaderboardComponent() {
  const {resetDateToUse, leaderboard} = Route.useLoaderData()
  const [sorting, setSorting] = React.useState<SortingState>([])

  const table = useReactTable({
    data: leaderboard.leaderboardEntries,
    columns,
    state: {sorting},
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    debugTable: true,
  })

  //don't ask
  let sortedLeaderboard = leaderboard.leaderboardEntries.toSorted((a, b) => a.credits - b.credits).toReversed();

  let xValues = sortedLeaderboard.map(e => e.agentSymbol);
  let yValuesCredits = sortedLeaderboard.map(e => e.credits);
  let yValuesShips = sortedLeaderboard.map(e => e.shipCount);

  const [isLog, setIsLog] = React.useState(true)


  return (
    <>
      <div className="flex flex-col gap-4">
        <h1>Leaderboard for reset {resetDateToUse}</h1>
        <div className="flex flex-row gap-4">
          <div className="p-2">
            <div className="h-2"/>
            {prettyTable(table)}
            <div>{table.getRowModel().rows.length.toLocaleString()} Rows</div>
          </div>
          <div className="w-full flex flex-col">
            <Plot
              debug={true}
              data={[
                {type: 'bar', x: xValues, y: yValuesCredits, name: "Credits"},
                {type: 'bar', x: xValues, y: yValuesShips, xaxis: 'x', yaxis: 'y2', name: "Ships"},
              ]}
              layout={{
                grid: {rows: 2, columns: 1, subplots: ['xy', 'xy2']},
                legend: {xanchor: "right", yanchor: "top", x: 0.99, y: 0.99},
                height: 800,
                width: 800,
                font: {
                  size: 10,
                  color: 'white'
                },
                paper_bgcolor: "rgba(0,0,0,0)",
                plot_bgcolor: "rgba(0,0,0,0)",

                /*plot_bgcolor: 'black',
                paper_bgcolor: 'black',*/
                yaxis: {type: isLog ? "log" : "linear", gridcolor: 'lightgray'},
                yaxis2: { gridcolor: 'lightgray'}

              }}
              config={{}}
            />
            <label>
              <input
                type="checkbox"
                checked={isLog}
                onChange={() => setIsLog(!isLog)}
              />
              Use log scale for credits
            </label>
          </div>
        </div>
      </div>
    </>
  )
}
