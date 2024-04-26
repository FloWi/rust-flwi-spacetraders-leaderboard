import {createFileRoute, useNavigate} from "@tanstack/react-router";
import {
  ApiLeaderboardEntry,
  CrateService,
  GetLeaderboardForResetResponseContent,
} from "../../../generated";

import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  RowSelectionState,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import React, {useEffect} from "react";
import Plot from "react-plotly.js";
import {Switch} from "../../@/components/ui/switch.tsx";
import {Label} from "../../@/components/ui/label.tsx";

import {prettyTable} from "../../components/prettyTable.tsx";
import {chartColors} from "../../utils/chartColors.ts";
import {zip} from "../../lib/utils.ts";
import {queryOptions, useSuspenseQuery} from "@tanstack/react-query";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../../@/components/ui/sheet";
import {Button} from "../../@/components/ui/button.tsx";
import {ScrollArea} from "../../@/components/ui/scroll-area.tsx";

type LeaderboardSearch = {
  agents?: string[];
};

interface UiLeaderboardEntry extends ApiLeaderboardEntry {
  //selected: boolean
  displayColor: string;
}

const columnHelper = createColumnHelper<UiLeaderboardEntry>();

let compactNumberFmt = new Intl.NumberFormat(undefined, {
  notation: "compact",
  compactDisplay: "short",
  //minimumSignificantDigits: 2
});

const columns = [
  columnHelper.accessor("displayColor", {
    cell: (info) => {
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
      let style = {
        borderColor: isSelected ? "transparent" : hexColor,
        backgroundColor: isSelected ? hexColor : "transparent",
      };

      return (
        <span className="border-2 w-4 h-4 rounded inline-block" style={style}/>
      );
    },
    header: "",
    size: 8,
    footer: (info) => info.column.id,
  }),
  columnHelper.accessor("agentSymbol", {
    cell: (info) => info.getValue(),
    footer: (info) => info.column.id,
  }),
  columnHelper.accessor("credits", {
    cell: (info) => compactNumberFmt.format(info.getValue()),
    footer: (info) => info.column.id,
    meta: {
      align: "right",
    },
  }),
];

export const Route = createFileRoute("/resets/$resetDate/leaderboard")({
  component: LeaderboardComponent,
  loaderDeps: ({search: {agents}}) => ({agents}),
  beforeLoad: async (arg) => {
    console.log("before load:");
    let selectedAgents = arg.search.agents ?? [];

    let options = leaderboardQueryOptions(arg.params.resetDate);

    let queryClient = arg.context.queryClient;
    const queryCache = queryClient.getQueryCache();
    const query = queryCache.find<GetLeaderboardForResetResponseContent>({
      queryKey: options.queryKey,
    });

    let entries = query?.state.data?.leaderboardEntries ?? [];
    let agentsInCache = entries.map((e) => e.agentSymbol);

    let needsInvalidation = selectedAgents.some(
      (a) => !agentsInCache.includes(a),
    );
    console.log("selected agents", selectedAgents);
    console.log("agents in cache", agentsInCache);
    console.log("arg", arg);
    console.log("needsInvalidation", needsInvalidation);

    if (needsInvalidation) {
      console.log("invalidating query");

      await queryClient.invalidateQueries({queryKey: options.queryKey});
    }

    // console.log("current state of query", query);
  },
  loader: async ({
                   //deps: { agents },
                   params: {resetDate},
                   context: {queryClient},
                 }) => {
    let options = leaderboardQueryOptions(resetDate);
    return queryClient.ensureQueryData(options);
  },

  validateSearch: (search: Record<string, unknown>): LeaderboardSearch => {
    // validate and parse the search params into a typed state
    return {
      agents: search?.agents as string[],
    };
  },
});

function calcSortedAndColoredLeaderboard(leaderboard: ApiLeaderboardEntry[]) {
  let sortedEntries = leaderboard
    .toSorted((a, b) => a.credits - b.credits)
    .toReversed();

  let sortedAndColoredLeaderboard: UiLeaderboardEntry[] = zip(
    sortedEntries.slice(0, 30),
    chartColors,
  ).map(([e, c]) => ({
    displayColor: c,
    ...e,
  }));

  return {sortedAndColoredLeaderboard};
}

export const leaderboardQueryOptions = (resetDate: string) =>
  queryOptions({
    queryKey: ["leaderboardData", resetDate],
    queryFn: () => CrateService.getLeaderboard({resetDate}),
  });

function LeaderboardComponent() {
  const {resetDate} = Route.useParams();
  const resetDateToUse = resetDate;
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({}); //manage your own row selection state

  const {data} = useSuspenseQuery(leaderboardQueryOptions(resetDate));
  const leaderboardEntries = data.leaderboardEntries;
  const {agents} = Route.useSearch(); //leaderboardEntries.map((e) => e.agentSymbol);

  // let states = useFetchState((state) => state.fetchStates);
  // let agents = useFetchState((state) => state.selectedAgents);

  // let current = states.get(resetDateToUse) ?? {
  //   lastRefresh: new Date(),
  //   leaderboard: [],
  //   historyData: [],
  // };

  let current = {leaderboard: leaderboardEntries};

  let memoizedLeaderboard = React.useMemo(() => {
    //select top 10 by default
    let selectedAgents: Record<string, boolean> = {};

    // // haven't found a way to convert an array into a record
    // sortedEntries.slice(0, 10).forEach((e) => {
    //   selectedAgents[e.agentSymbol] = true;
    // });
    agents?.forEach((agentSymbol) => (selectedAgents[agentSymbol] = true));

    setRowSelection(selectedAgents);
    return calcSortedAndColoredLeaderboard(current.leaderboard);
  }, [current.leaderboard]);

  let chartData = React.useMemo(() => {
    let selectedAgents = Object.keys(rowSelection);

    let chartEntries = memoizedLeaderboard.sortedAndColoredLeaderboard.filter(
      (e) => selectedAgents.includes(e.agentSymbol),
    );

    let colors = chartEntries.map(({displayColor}) => displayColor);
    let xValues = chartEntries.map((e) => e.agentSymbol);
    let yValuesCredits = chartEntries.map((e) => e.credits);
    let yValuesShips = chartEntries.map((e) => e.shipCount);

    return {chartEntries, colors, xValues, yValuesCredits, yValuesShips};
  }, [rowSelection, current.leaderboard]);

  const [isLog, setIsLog] = React.useState(true);

  const table = useReactTable({
    data: memoizedLeaderboard.sortedAndColoredLeaderboard,
    // defaultColumn: {
    //   size: 100,
    //   minSize: 50,
    // },
    columns,
    getRowId: (row) => row.agentSymbol,
    onRowSelectionChange: setRowSelection, //hoist up the row selection state to your own scope
    state: {sorting, rowSelection},
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    debugTable: true,
  });

  const navigate = useNavigate({from: Route.fullPath});

  useEffect(() => {
    let newAgentSelection = Object.keys(rowSelection);

    //fire-and-forget promise call seems to be ok? YOLO
    navigate({
      search: () => ({
        agents: newAgentSelection,
      }),
    });
  }, [resetDateToUse, rowSelection]);

  const selectTop10 = () => {
    let top10Agents = memoizedLeaderboard.sortedAndColoredLeaderboard
      .slice(0, 10)
      .map((e) => e.agentSymbol);
    const newSelection: RowSelectionState = top10Agents.reduce(
      (o, key) => ({...o, [key]: true}),
      {},
    );
    setRowSelection((_) => newSelection);
  };

  const clearSelection = () => {
    setRowSelection((_) => {
      return {};
    });
  };

  return (
    <>
      <div className="flex flex-col gap-4 w-full">
        <h1>Leaderboard for reset {resetDateToUse}</h1>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline">Change Selection</Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-11/12 md:w-fit flex flex-col gap-4"
          >
            <SheetHeader>
              <SheetTitle>Agent Selection</SheetTitle>
              <SheetDescription>
                {agents?.length ?? 0} selected
              </SheetDescription>
            </SheetHeader>
            <ScrollArea>
              <div className="flex flex-col gap-2 mt-2">
                {prettyTable(table)}
              </div>
            </ScrollArea>
            <SheetFooter>
              <Button variant="outline" size="sm" onClick={selectTop10}>
                Select Top 10
              </Button>

              <Button variant="outline" size="sm" onClick={clearSelection}>
                Clear Selection
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <div className="w-full flex flex-col">
          <div>
            <h3 className="text-xl font-bold">
              Credits {isLog ? "(log axis)" : ""}
            </h3>
            <div className="flex items-center space-x-2">
              <Switch
                id="log-y-axis"
                checked={isLog}
                onCheckedChange={setIsLog}
              />
              <Label htmlFor="log-y-axis">Use Log For Y-Axis</Label>
            </div>
            <Plot
              className="w-full"
              data={[
                {
                  type: "bar",
                  x: chartData.xValues,
                  y: chartData.yValuesCredits,
                  name: "Credits",
                  marker: {color: chartData.colors},
                },
              ]}
              layout={{
                // remove margin reserved for title area
                margin: {
                  l: 50,
                  r: 50,
                  b: 50,
                  t: 50,
                  //pad: 4,
                },
                modebar: {orientation: "h"},
                showlegend: false,
                height: 500,
                font: {
                  size: 10,
                  color: "lightgray",
                },
                paper_bgcolor: "rgba(0,0,0,0)",
                plot_bgcolor: "rgba(0,0,0,0)",

                xaxis: {
                  showline: true,
                  linecolor: "lightgray",
                },

                yaxis: {
                  type: isLog ? "log" : "linear",
                  tick0: 0,
                  zeroline: true,
                  showline: false,
                  linecolor: "lightgray",
                  gridcolor: "lightgray",
                  hoverformat: ",d",
                  tickformat: ".2s", // d3.format(".2s")(42e6) // SI-prefix with two significant digits, "42M" https://d3js.org/d3-format
                },
              }}
              config={{displayModeBar: false, responsive: true}}
            />
          </div>

          <div>
            <h3 className="text-xl font-bold">Ships</h3>
            <Plot
              className="w-full"
              data={[
                {
                  type: "bar",
                  x: chartData.xValues,
                  y: chartData.yValuesShips,
                  xaxis: "x",
                  yaxis: "y2",
                  name: "Ships",
                  marker: {color: chartData.colors},
                },
              ]}
              layout={{
                // remove margin reserved for title area
                margin: {
                  l: 50,
                  r: 50,
                  b: 50,
                  t: 50,
                  //pad: 4,
                },
                showlegend: false,
                height: 500,
                font: {
                  size: 10,
                  color: "lightgray",
                },
                paper_bgcolor: "rgba(0,0,0,0)",
                plot_bgcolor: "rgba(0,0,0,0)",

                xaxis: {
                  showline: true,
                  linecolor: "lightgray",
                },

                yaxis: {
                  type: "linear",
                  tick0: 0,
                  zeroline: true,
                  showline: true,
                  linecolor: "lightgray",
                  zerolinecolor: "lightgray",
                  gridcolor: "lightgray",
                  tickformat: ",d",
                }, //integer
              }}
              config={{displayModeBar: false, responsive: true}}
            />
          </div>
        </div>
      </div>
    </>
  );
}
