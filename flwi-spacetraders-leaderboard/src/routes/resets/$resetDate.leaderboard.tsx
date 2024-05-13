import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ApiConstructionMaterialMostRecentProgressEntry,
  GetLeaderboardForResetResponseContent,
} from "../../../generated";

import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  RowData,
  RowSelectionState,
  SortingState,
  Table,
  useReactTable,
} from "@tanstack/react-table";
import React, { useEffect } from "react";
import Plot from "react-plotly.js";
import { Switch } from "../../@/components/ui/switch.tsx";
import { Label } from "../../@/components/ui/label.tsx";

import { prettyTable } from "../../components/prettyTable.tsx";
import { useSuspenseQuery } from "@tanstack/react-query";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../../@/components/ui/sheet";
import { Button } from "../../@/components/ui/button.tsx";
import { ScrollArea } from "../../@/components/ui/scroll-area.tsx";
import { HamburgerMenuIcon } from "@radix-ui/react-icons";
import {
  jumpGateAssignmentsQueryOptions,
  jumpGateMostRecentProgressQueryOptions,
  leaderboardQueryOptions,
  resetDatesQueryOptions,
} from "../../utils/queryOptions.ts";
import { compactNumberFmt } from "../../lib/formatters.ts";
import {
  calcSortedAndColoredLeaderboard,
  UiLeaderboardEntry,
} from "../../lib/leaderboard-helper.ts";
import * as _ from "lodash";

type AgentSelectionSearch = {
  agents?: string[];
};

const columnHelper = createColumnHelper<UiLeaderboardEntry>();

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
        <span className="border-2 w-4 h-4 rounded inline-block" style={style} />
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
  pendingComponent: () => <div>Loading...</div>,
  staticData: {
    customData: "I'm the leaderboard route",
  },

  loaderDeps: ({ search: { agents } }) => ({ agents }),
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

      await queryClient.invalidateQueries({ queryKey: options.queryKey });
    }

    // console.log("current state of query", query);
  },
  loader: async ({
    //deps: { agents },
    params: { resetDate },
    context: { queryClient },
  }) => {
    // intentional fire-and-forget according to docs :-/
    // https://tanstack.com/query/latest/docs/framework/react/guides/prefetching#router-integration
    queryClient.prefetchQuery(leaderboardQueryOptions(resetDate));
    queryClient.prefetchQuery(jumpGateAssignmentsQueryOptions(resetDate));
    queryClient.prefetchQuery(
      jumpGateMostRecentProgressQueryOptions(resetDate),
    );

    await queryClient.prefetchQuery(resetDatesQueryOptions);
  },

  validateSearch: (search: Record<string, unknown>): AgentSelectionSearch => {
    // validate and parse the search params into a typed state
    return {
      agents: search?.agents as string[],
    };
  },
});

type BarChartConfig = {
  title: string;
  mutedColorTitle?: string;
  isLog: boolean;
  xValues: string[];
  yValues: number[];
  colors: string[];
};

function renderBarChart({
  title,
  mutedColorTitle,
  isLog,
  xValues,
  yValues,
  colors,
}: BarChartConfig) {
  return (
    <div>
      <div className="flex flex-row gap-0.5 items-center ">
        <h3 className="text-xl font-bold">{title}</h3>
        {mutedColorTitle ? (
          <p className="text-sm text-muted-foreground">&nbsp; | &nbsp;</p>
        ) : (
          <></>
        )}
        {mutedColorTitle ? (
          <p className="text-sm text-muted-foreground">{mutedColorTitle}</p>
        ) : (
          <></>
        )}
      </div>

      <Plot
        className="w-full"
        data={[
          {
            type: "bar",
            x: xValues,
            y: yValues,
            name: title,
            marker: { color: colors },
          },
        ]}
        layout={{
          // remove margin reserved for title area
          margin: {
            l: 50,
            r: 50,
            b: 50,
            t: 20,
            //pad: 4,
          },
          modebar: { orientation: "h" },
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
            // dtick: 1,
            zeroline: true,
            showline: false,
            linecolor: "lightgray",
            gridcolor: "lightgray",
            hoverformat: ",d",
            tickformat: ".2s", // d3.format(".2s")(42e6) // SI-prefix with two significant digits, "42M" https://d3js.org/d3-format
          },
        }}
        config={{ displayModeBar: false, responsive: true }}
      />
    </div>
  );
}

function sheetPage(
  isLog: boolean,
  setIsLog: (value: ((prevState: boolean) => boolean) | boolean) => void,
  selectedAgents: string[],
  memoizedLeaderboard: {
    sortedAndColoredLeaderboard: UiLeaderboardEntry[];
  },
  table: Table<UiLeaderboardEntry>,
  selectTop10: () => void,
  selectBuilders: () => void,
  clearSelection: () => void,
  pageContent: React.JSX.Element,
) {
  return (
    <div className="flex flex-col gap-4 w-full">
      <Sheet>
        <div className="flex flex-row gap-2 mt-4">
          <SheetTrigger asChild>
            <HamburgerMenuIcon />
          </SheetTrigger>
          <div className="flex items-center space-x-2 text-sm">
            <Switch
              id="log-y-axis"
              checked={isLog}
              onCheckedChange={setIsLog}
            />
            <Label htmlFor="log-y-axis">Use Log For Y-Axis</Label>
          </div>
        </div>
        <SheetContent
          side="left"
          className="w-11/12 h-5/6 md:w-fit flex flex-col gap-4"
        >
          <SheetHeader className="space-y-1">
            <SheetTitle className="text-sm font-medium leading-none">
              Agent Selection
            </SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground">
              {selectedAgents.length} of{" "}
              {memoizedLeaderboard.sortedAndColoredLeaderboard.length} selected
            </SheetDescription>
          </SheetHeader>
          <ScrollArea>
            <div className="flex flex-col gap-2 mt-2">{prettyTable(table)}</div>
          </ScrollArea>
          <SheetFooter>
            <Button variant="outline" size="sm" onClick={selectTop10}>
              Top 10
            </Button>
            <Button variant="outline" size="sm" onClick={selectBuilders}>
              Builders
            </Button>
            <Button variant="outline" size="sm" onClick={clearSelection}>
              Clear
            </Button>
          </SheetFooter>
        </SheetContent>
        {pageContent}
      </Sheet>
    </div>
  );
}

function LeaderboardComponent() {
  const { resetDate } = Route.useParams();
  const resetDateToUse = resetDate;
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({}); //manage your own row selection state

  const { data: leaderboardData } = useSuspenseQuery(
    leaderboardQueryOptions(resetDate),
  );

  const { data: jumpGateAssignmentData } = useSuspenseQuery(
    jumpGateAssignmentsQueryOptions(resetDate),
  );

  const { data: jumpGateMostRecentConstructionProgress } = useSuspenseQuery(
    jumpGateMostRecentProgressQueryOptions(resetDate),
  );
  // const { data: resetDates } = useSuspenseQuery(resetDatesQueryOptions);
  const leaderboardEntries = leaderboardData.leaderboardEntries;
  const { agents } = Route.useSearch(); //leaderboardEntries.map((e) => e.agentSymbol);

  const [isLog, setIsLog] = React.useState(true);

  // let states = useFetchState((state) => state.fetchStates);
  // let agents = useFetchState((state) => state.selectedAgents);

  // let current = states.get(resetDateToUse) ?? {
  //   lastRefresh: new Date(),
  //   leaderboard: [],
  //   historyData: [],
  // };

  let current = { leaderboard: leaderboardEntries };

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

  let { relevantEntries } = React.useMemo(() => {
    let selectedAgents = Object.keys(rowSelection);

    let relevantEntries =
      memoizedLeaderboard.sortedAndColoredLeaderboard.filter((e) =>
        selectedAgents.includes(e.agentSymbol),
      );

    return { selectedAgents, relevantEntries };
  }, [rowSelection, current.leaderboard]);

  let agentChartConfigs: BarChartConfig[] = React.useMemo(() => {
    let colors = relevantEntries.map(({ displayColor }) => displayColor);
    let xValues = relevantEntries.map((e) => e.agentSymbol);
    let yValuesCredits = relevantEntries.map((e) => e.credits);
    let yValuesShips = relevantEntries.map((e) => e.shipCount);

    return [
      {
        title: "Credits",
        xValues: xValues,
        yValues: yValuesCredits,
        isLog,
        colors: colors,
      },
      {
        title: "Ships",
        xValues: xValues,
        yValues: yValuesShips,
        isLog,
        colors: colors,
      },
    ];
  }, [rowSelection, current.leaderboard, isLog]);

  let materialProgressChartData: BarChartConfig[] = React.useMemo(() => {
    let relevantJumpGates = _.uniq(
      relevantEntries.map((r) => r.jumpGateWaypointSymbol),
    );
    const constructionMaterialTradeSymbols = _.uniqBy(
      jumpGateMostRecentConstructionProgress.progressEntries,
      (cm) => cm.tradeSymbol,
    );

    let relevantConstructionProgressEntries =
      jumpGateMostRecentConstructionProgress.progressEntries.filter(
        ({ jumpGateWaypointSymbol }) => {
          return relevantJumpGates.includes(jumpGateWaypointSymbol);
        },
      );

    return _.sortBy(
      constructionMaterialTradeSymbols,
      (cm) => cm.tradeSymbol,
    ).map(({ tradeSymbol, required }) => {
      let materialEntries = relevantConstructionProgressEntries.filter(
        (cpe) => cpe.tradeSymbol === tradeSymbol,
      );

      let fulfilledValues = relevantEntries.map((r) => {
        return (
          materialEntries.find(
            (cme) => cme.jumpGateWaypointSymbol === r.jumpGateWaypointSymbol,
          )?.fulfilled ?? 0
        );
      });

      return {
        title: tradeSymbol,
        mutedColorTitle: `${required} required`,
        xValues: relevantEntries.map((r) => r.agentSymbol),
        yValues: fulfilledValues,
        isLog,
        colors: relevantEntries.map((r) => r.displayColor),
      };
    });
  }, [rowSelection, current.leaderboard, isLog]);

  const table = useReactTable({
    data: memoizedLeaderboard.sortedAndColoredLeaderboard,
    columns,
    getRowId: (row) => row.agentSymbol,
    onRowSelectionChange: setRowSelection, //hoist up the row selection state to your own scope
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    debugTable: true,
  });

  const navigate = useNavigate({ from: Route.fullPath });

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
      (o, key) => ({ ...o, [key]: true }),
      {},
    );
    setRowSelection((_) => newSelection);
  };

  const selectBuilders = () => {
    let jumpGatesUnderConstruction =
      jumpGateMostRecentConstructionProgress.progressEntries
        .filter((cpe) => cpe.fulfilled > 0 && cpe.required > 1)
        .map((cpe) => cpe.jumpGateWaypointSymbol);
    let buildingAgents = memoizedLeaderboard.sortedAndColoredLeaderboard
      .filter((e) =>
        jumpGatesUnderConstruction.includes(e.jumpGateWaypointSymbol),
      )
      .map((e) => e.agentSymbol);

    const newSelection: RowSelectionState = buildingAgents.reduce(
      (o, key) => ({ ...o, [key]: true }),
      {},
    );
    setRowSelection((_) => newSelection);
  };

  const clearSelection = () => {
    setRowSelection((_) => {
      return {};
    });
  };

  const chartConfigs = [...agentChartConfigs, ...materialProgressChartData];
  let pageContent = (
    <>
      {agents?.length ?? 0 > 0 ? (
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-y-6">
          {chartConfigs.map(renderBarChart)}
        </div>
      ) : (
        <div>Please select some agents</div>
      )}
    </>
  );

  return (
    <>
      {sheetPage(
        isLog,
        setIsLog,
        agents ?? [],
        memoizedLeaderboard,
        table,
        selectTop10,
        selectBuilders,
        clearSelection,
        pageContent,
      )}
    </>
  );
}
