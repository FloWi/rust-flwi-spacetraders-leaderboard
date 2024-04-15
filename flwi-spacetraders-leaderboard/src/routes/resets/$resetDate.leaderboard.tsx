import {createFileRoute} from '@tanstack/react-router'
import {ApiLeaderboardEntry, CrateService} from "../../../generated";

import {createColumnHelper, getCoreRowModel, getSortedRowModel, RowSelectionState, SortingState, useReactTable,} from '@tanstack/react-table'
import React from "react";
import Plot from 'react-plotly.js';
import {Switch} from "../../@/components/ui/switch.tsx";
import {Label} from "../../@/components/ui/label.tsx";

import {prettyTable} from "../../components/prettyTable.tsx";
import {chartColors} from "../../utils/chartColors.ts";
import {zip} from "../../lib/utils.ts";

type LeaderboardSearch = {
  agents?: string[]
}

interface UiLeaderboardEntry extends ApiLeaderboardEntry {
  //selected: boolean
  displayColor: string
}

const columnHelper = createColumnHelper<UiLeaderboardEntry>()
let numberFmt = new Intl.NumberFormat();

const columns = [
  columnHelper.accessor('displayColor', {
    cell: info => {
      /*
                      span(
                  cls := "border border-2 w-4 h-4 rounded inline-block",
                  borderColor(if (agentSelection.contains(agent)) "transparent" else col),
                  backgroundColor(if (agentSelection.contains(agent)) col else "transparent"),
                  //                    eventListener,
                )

       */

      let isSelected = info.row.getIsSelected();
      let hexColor = info.getValue();
      let style = {borderColor: isSelected ? "transparent" : hexColor, backgroundColor: isSelected ? hexColor : "transparent"}

      return <span className="border-2 w-4 h-4 rounded inline-block" style={style}/>
    },
    header: "",
    footer: info => info.column.id,
  }),
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

export const Route = createFileRoute('/resets/$resetDate/leaderboard')({
  component: LeaderboardComponent,
  loaderDeps: ({search: {agents}}) => ({agents}),
  loader: async ({deps: {agents}, params: {resetDate}}) => {
    let resetDates = await CrateService.getResetDates();

    let resetDateToUse = resetDate ? resetDate : resetDates.resetDates.toSorted().at(-1) ?? "foobar";

    let leaderboard = await CrateService.getLeaderboard({resetDate: resetDateToUse});

    return {resetDateToUse, leaderboard, agents};
  },

  validateSearch: (search: Record<string, unknown>): LeaderboardSearch => {
    // validate and parse the search params into a typed state
    return {
      agents: search?.agents as string[],
    }
  },

})

function LeaderboardComponent() {
  const {resetDateToUse, leaderboard, agents} = Route.useLoaderData()
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({}) //manage your own row selection state


  let foo = React.useMemo(() => {
    //don't ask
    let sortedEntries = leaderboard.leaderboardEntries.toSorted((a, b) => a.credits - b.credits).toReversed();

    let sortedAndColoredLeaderboard: UiLeaderboardEntry[] = zip(sortedEntries.slice(0, 30), chartColors).map(([e, c]) => ({
      displayColor: c, ...e
    }));

    //select top 10 by default
    let selectedAgents: Record<string, boolean> = {}

    // haven't found a way to convert an array into a record
    sortedEntries.slice(0, 10).forEach(e => {
      selectedAgents[e.agentSymbol] = true
    });

    setRowSelection(selectedAgents)

    return {sortedAndColoredLeaderboard}

  }, [leaderboard])


  let chartData = React.useMemo(() => {

    let selectedAgents = Object.keys(rowSelection)

    let chartEntries = foo.sortedAndColoredLeaderboard.filter(e => selectedAgents.includes(e.agentSymbol))

    let colors = chartEntries.map(({displayColor}) => displayColor)
    let xValues = chartEntries.map(e => e.agentSymbol);
    let yValuesCredits = chartEntries.map(e => e.credits);
    let yValuesShips = chartEntries.map(e => e.shipCount);

    return {chartEntries, colors, xValues, yValuesCredits, yValuesShips}
  }, [rowSelection, leaderboard]);


  const [isLog, setIsLog] = React.useState(true)

  const table = useReactTable({
    data: foo.sortedAndColoredLeaderboard,
    defaultColumn: {
      size: 200,
      minSize: 50,
    },
    columns,
    getRowId: row => row.agentSymbol,
    onRowSelectionChange: setRowSelection, //hoist up the row selection state to your own scope
    state: {sorting, rowSelection},
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    debugTable: true,
  })


  return (
    <>
      <div className="flex flex-col gap-4">
        <h1>Leaderboard for reset {resetDateToUse}</h1>
        <div className="flex flex-row gap-4">
          <div className="p-2">
            <div className="h-2 flex flex-col gap-2">
              {prettyTable(table)}
              <div>{table.getRowModel().rows.length.toLocaleString()} Rows</div>
              <pre>{agents?.join("\n")}</pre>
            </div>
          </div>
          <div className="w-full flex flex-col">

            <div>
              <h3 className="text-xl font-bold">Credits {isLog ? "(log axis)" : ""}</h3>
              <div className="flex items-center space-x-2">

                <Switch id="log-y-axis"
                        checked={isLog}
                        onCheckedChange={setIsLog}/>
                <Label htmlFor="log-y-axis">Use Log For Y-Axis</Label>
              </div>
              <Plot
                data={[
                  {type: 'bar', x: chartData.xValues, y: chartData.yValuesCredits, name: "Credits", marker: {color: chartData.colors}},
                ]}
                layout={{
                  showlegend: false,
                  height: 500,
                  width: 1200,
                  font: {
                    size: 10,
                    color: 'white'
                  },
                  paper_bgcolor: "rgba(0,0,0,0)",
                  plot_bgcolor: "rgba(0,0,0,0)",

                  yaxis: {type: isLog ? "log" : "linear", gridcolor: 'lightgray', tickformat: ",d"},
                }}
                config={{}}
              />
            </div>

            <div>
              <h3 className="text-xl font-bold">Ships</h3>
              <Plot
                data={[
                  {type: 'bar', x: chartData.xValues, y: chartData.yValuesShips, xaxis: 'x', yaxis: 'y2', name: "Ships", marker: {color: chartData.colors}},
                ]}
                layout={{
                  showlegend: false,
                  height: 500,
                  width: 1200,
                  font: {
                    size: 10,
                    color: 'white'
                  },
                  paper_bgcolor: "rgba(0,0,0,0)",
                  plot_bgcolor: "rgba(0,0,0,0)",


                  yaxis: {gridcolor: 'lightgray', tickformat: ",d"}, //integer

                }}
                config={{}}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
