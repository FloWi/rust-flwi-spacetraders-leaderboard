import {createFileRoute} from '@tanstack/react-router'
import {ApiLeaderboardEntry, CrateService} from "../../../generated";

import {createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, SortingState, Table, useReactTable,} from '@tanstack/react-table'
import React from "react";
import Plot from 'react-plotly.js';
import {Switch} from "../../@/components/ui/switch.tsx";
import {Label} from "../../@/components/ui/label.tsx";


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
    meta: {
      align: 'right'
    },
  }),
  columnHelper.accessor('shipCount', {
    cell: info => numberFmt.format(info.getValue()),
    footer: info => info.column.id,
    meta: {
      align: 'right'
    },
  }),
]

let chartColors = [

// d3 category 20 scheme
"#1f77b4",
  "#ffbb78",
  "#2ca02c",
  "#d62728",
  "#aec7e8",
  "#ff7f0e",
  "#98df8a",
  "#9467bd",
  "#ff9896",
  "#9edae5",
  "#c5b0d5",
  "#8c564b",
  "#f7b6d2",
  "#c7c7c7",
  "#bcbd22",
  "#dbdb8d",
  "#e377c2",
  "#17becf",
  // d3 accent scheme
  "#7fc97f",
  "#beaed4",
  "#fdc086",
  "#386cb0",
  "#f0027f",
  "#bf5b17",
  "#ffff99",
  // d3 dark scheme
  "#1b9e77",
  "#d95f02",
  "#7570b3",
  "#e6ab02",
  "#e7298a",
  "#66a61e",
  "#a6761d",
]

export const Route = createFileRoute('/reset/leaderboard')({
  component: LeaderboardComponent,
  loaderDeps: ({search: {resetDate}}) => ({resetDate}),
  loader: async ({deps: {resetDate}}) => {
    let resetDates = await CrateService.getResetDates();


    let resetDateToUse = resetDate ? resetDate : resetDates.resetDates.toSorted().at(-1) ?? "foobar";
    console.log("resetDate", resetDate)
    console.log("resetDateToUse", resetDateToUse)

    let leaderboard = await CrateService.getLeaderboard({resetDate: resetDateToUse});

    return {resetDateToUse, leaderboard};
  },

  validateSearch: (search: Record<string, unknown>): LeaderboardSearch => {
    // validate and parse the search params into a typed state
    return {
      resetDate: search?.resetDate as string,
    }
  },

})

function zip<T, U>(a: T[], b: U[]): [T, U][] {
  const length = Math.min(a.length, b.length);
  const result: [T, U][] = [];
  for (let i = 0; i < length; i++) {
    result.push([a[i], b[i]]);
  }
  return result;
}



function prettyTable<T>(table: Table<T>) {
  let prettyTable = <table>
    <thead>
    {table.getHeaderGroups().map(headerGroup => (
      <tr key={headerGroup.id}>
        {headerGroup.headers.map(header => {
          return (
            <th key={header.id} colSpan={header.colSpan}
                align={(header.column.columnDef.meta as any)?.align}
                style={{ width: `${header.getSize()}px` }}
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
          <tr key={row.id}>
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

function LeaderboardComponent() {
  const {resetDateToUse, leaderboard} = Route.useLoaderData()
  const [sorting, setSorting] = React.useState<SortingState>([])

  const table = useReactTable({
    data: leaderboard.leaderboardEntries,
    defaultColumn: {
      size: 200,
      minSize: 50,
    },
    columns,
    state: {sorting},
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    debugTable: true,
  })

  //don't ask
  let sortedEntries = leaderboard.leaderboardEntries.toSorted((a, b) => a.credits - b.credits).toReversed();

  let sortedLeaderboard = zip(sortedEntries.slice(0, 20), chartColors);



  let colors = sortedLeaderboard.map(([_, color]) => color)
  let xValues = sortedLeaderboard.map(([e, _]) => e.agentSymbol);
  let yValuesCredits = sortedLeaderboard.map(([e, _]) => e.credits);
  let yValuesShips = sortedLeaderboard.map(([e, _]) => e.shipCount);

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
            <div className="flex items-center space-x-2">

              <Switch id="log-y-axis"
                      checked={isLog}
                      onCheckedChange={setIsLog}/>
              <Label htmlFor="log-y-axis">Use Log For Y-Axis</Label>
            </div>
            <Plot
              debug={true}
              data={[
                {type: 'bar', x: xValues, y: yValuesCredits, name: "Credits", marker: {color: colors }},
                {type: 'bar', x: xValues, y: yValuesShips, xaxis: 'x', yaxis: 'y2', name: "Ships", marker: {color: colors }},
              ]}
              layout={{
                grid: {rows: 2, columns: 1, subplots: ['xy', 'xy2']},
                showlegend: false,
                height: 1000,
                width: 1200,
                font: {
                  size: 10,
                  color: 'white'
                },
                paper_bgcolor: "rgba(0,0,0,0)",
                plot_bgcolor: "rgba(0,0,0,0)",

                /*plot_bgcolor: 'black',
                paper_bgcolor: 'black',*/
                yaxis: {type: isLog ? "log" : "linear", gridcolor: 'lightgray'},
                yaxis2: {gridcolor: 'lightgray'}

              }}
              config={{}}
            />
          </div>
        </div>
      </div>
    </>
  )
}
