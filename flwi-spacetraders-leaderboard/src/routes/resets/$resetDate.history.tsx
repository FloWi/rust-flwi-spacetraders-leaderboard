import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  historyQueryOptions,
  jumpGateMostRecentProgressQueryOptions,
  leaderboardQueryOptions,
  resetDatesQueryOptions,
} from "../../utils/queryOptions.ts";
import { useSuspenseQuery } from "@tanstack/react-query";
import Plot from "react-plotly.js";
import React, { useEffect, useMemo } from "react";
import {
  ApiConstructionMaterialHistoryEntry,
  ApiResetDateMeta,
  GetHistoryDataForResetResponseContent,
  GetLeaderboardForResetResponseContent,
} from "../../../generated";
import { Data } from "plotly.js";
import { calcSortedAndColoredLeaderboard, UiLeaderboardEntry } from "../../lib/leaderboard-helper.ts";
import * as _ from "lodash";
import { AgentSelectionSheetPage } from "../../components/agent-selection-sheet-page.tsx";
import { createLeaderboardTable } from "../../components/agent-selection-table.tsx";
import { RowSelectionState, SortingState } from "@tanstack/react-table";

type AgentSelectionSearch = {
  agents?: string[];
};

export const Route = createFileRoute("/resets/$resetDate/history")({
  component: HistoryComponent,
  pendingComponent: () => <div>Loading...</div>,

  staticData: { customData: "I'm the history route" },

  validateSearch: (search: Record<string, unknown>): AgentSelectionSearch => {
    // validate and parse the search params into a typed state
    return {
      agents: search?.agents as string[],
    };
  },

  loaderDeps: ({ search: { agents } }) => ({ agents }),

  beforeLoad: async (arg) => {
    console.log("before load:");
    let selectedAgents = arg.search.agents ?? [];

    let options = historyQueryOptions(arg.params.resetDate, selectedAgents);

    let queryClient = arg.context.queryClient;
    const queryCache = queryClient.getQueryCache();
    const query = queryCache.find<GetHistoryDataForResetResponseContent>({
      queryKey: options.queryKey,
    });

    let entries = query?.state.data?.agentHistory ?? [];
    let agentsInCache = entries.map((e) => e.agentSymbol);

    let needsInvalidation = selectedAgents.some((a) => !agentsInCache.includes(a));
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

  loader: async ({ params: { resetDate }, context: { queryClient }, deps: { agents } }) => {
    // intentional fire-and-forget according to docs :-/
    // https://tanstack.com/query/latest/docs/framework/react/guides/prefetching#router-integration
    queryClient.prefetchQuery(historyQueryOptions(resetDate, agents ?? []));
    queryClient.prefetchQuery(jumpGateMostRecentProgressQueryOptions(resetDate));
    queryClient.prefetchQuery(leaderboardQueryOptions(resetDate));

    await queryClient.prefetchQuery(resetDatesQueryOptions);
  },
});

function HistoryComponent() {
  const { resetDate } = Route.useParams();
  const { agents } = Route.useSearch();

  const { data: resetDates } = useSuspenseQuery(resetDatesQueryOptions);
  const { data: historyData } = useSuspenseQuery(historyQueryOptions(resetDate, agents ?? []));
  const { data: jumpGateMostRecentConstructionProgress } = useSuspenseQuery(
    jumpGateMostRecentProgressQueryOptions(resetDate),
  );
  const [isLog, setIsLog] = React.useState(true);

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({}); //manage your own row selection state

  const { data: leaderboardData } = useSuspenseQuery(leaderboardQueryOptions(resetDate));
  // const { data: resetDates } = useSuspenseQuery(resetDatesQueryOptions);
  const leaderboardEntries = leaderboardData.leaderboardEntries;

  let current = { leaderboard: leaderboardEntries };

  let memoizedLeaderboard = React.useMemo(() => {
    let selectedAgents: Record<string, boolean> = {};
    agents?.forEach((agentSymbol) => (selectedAgents[agentSymbol] = true));

    setRowSelection(selectedAgents);
    return calcSortedAndColoredLeaderboard(current.leaderboard);
  }, [current.leaderboard]);

  let selectedReset = useMemo(() => {
    return resetDates.find((r) => r.resetDate === resetDate);
  }, [resetDate, resetDates]);

  let charts = useMemo(() => {
    console.log(`creating charts for selected agents: ${agents}}`);
    return renderTimeSeriesCharts(
      true,
      historyData,
      memoizedLeaderboard.sortedAndColoredLeaderboard,
      agents ?? [],
      selectedReset,
    );
  }, [resetDate, agents, historyData]);

  const navigate = useNavigate({ from: Route.fullPath });

  useEffect(() => {
    let newAgentSelection = Object.keys(rowSelection);

    //fire-and-forget promise call seems to be ok? YOLO
    navigate({
      search: () => ({
        agents: newAgentSelection,
      }),
    });
  }, [resetDate, rowSelection]);

  const selectAgents = (newSelectedAgents: string[]) => {
    const newSelection: RowSelectionState = newSelectedAgents.reduce((o, key) => ({ ...o, [key]: true }), {});
    setRowSelection((_) => newSelection);
  };

  const table = createLeaderboardTable(memoizedLeaderboard, setRowSelection, sorting, rowSelection, setSorting);

  return (
    <AgentSelectionSheetPage
      isLog={isLog}
      setIsLog={setIsLog}
      selectedAgents={agents ?? []}
      setSelectedAgents={selectAgents}
      memoizedLeaderboard={memoizedLeaderboard}
      jumpGateMostRecentConstructionProgress={jumpGateMostRecentConstructionProgress}
      table={table}
    >
      {/*<ResetHeaderBar*/}
      {/*  resetDates={resetDates}*/}
      {/*  resetDate={resetDate}*/}
      {/*  selectedAgents={selectedAgents}*/}
      {/*  linkToSamePageDifferentResetProps={(rd) => {*/}
      {/*    return {*/}
      {/*      to: "/resets/$resetDate/history",*/}
      {/*      params: {resetDate: rd},*/}
      {/*      search: {selectedAgents},*/}
      {/*    };*/}
      {/*  }}*/}
      {/*/>*/}
      <div className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold pt-4">Hello /reset/{resetDate}/history!</h2>
        {charts}
      </div>
    </AgentSelectionSheetPage>
  );
}

function convertMinutesIntoDateTime(firstTs: Date, minutes: number[]): Date[] {
  return minutes.map((m) => new Date(firstTs.getTime() + m * 60 * 1000));
}

function createMaterialChartTraces(
  sortedAndColoredLeaderboard: UiLeaderboardEntry[],
  tradeGoodSymbol: string,
  constructionMaterialHistory: Array<ApiConstructionMaterialHistoryEntry>,
  selectedAgents: string[],
  firstTs: Date,
): Data[] {
  let relevantHistoryEntries = constructionMaterialHistory.filter((h) => h.tradeSymbol === tradeGoodSymbol);

  let relevantSortedAndColoredLeaderboard = sortedAndColoredLeaderboard.filter((lb) =>
    selectedAgents.includes(lb.agentSymbol),
  );

  return relevantHistoryEntries.map((h) => {
    let color =
      relevantSortedAndColoredLeaderboard.find((lb) => lb.jumpGateWaypointSymbol === h.jumpGateWaypointSymbol)
        ?.displayColor ?? "black";

    let agentsInThisSystem = sortedAndColoredLeaderboard
      .map((lb, idx) => {
        return { ...lb, rank: idx + 1 };
      })
      .filter((lb) => lb.jumpGateWaypointSymbol === h.jumpGateWaypointSymbol)
      .map((lb) => lb);

    let agentsDescription = agentsInThisSystem.map((a) => `${a.rank}. ${a.agentSymbol}`).join(", ");

    return {
      type: "scatter",
      name: `${h.jumpGateWaypointSymbol}: (${agentsInThisSystem.length} agent(s)\n${agentsDescription})`,
      x: convertMinutesIntoDateTime(firstTs, h.eventTimesMinutes),
      y: h.fulfilled,
      hovertemplate: `
<b>${h.jumpGateWaypointSymbol}</b><br>
<b>Agents: </b>${agentsDescription}<br>
<b>fulfilled: </b>%{y:,d}<br>
<b>Date: </b>%{x}
<extra></extra>`, // the empty extra-thingy disables the rendering of the trace-name in the hover info.
      marker: {
        color,
      },
    };
  });
}

function renderTimeSeriesCharts(
  isLog: boolean,
  { agentHistory, constructionMaterialHistory }: GetHistoryDataForResetResponseContent,
  sortedAndColoredLeaderboard: UiLeaderboardEntry[],
  selectedAgents: string[],
  selectedReset: ApiResetDateMeta | undefined,
) {
  let maybeFirstTs = selectedReset?.firstTs;
  const firstTs = maybeFirstTs ? new Date(Date.parse(maybeFirstTs)) : new Date(0);
  const agentCreditsTraces: Data[] = agentHistory.map((foo) => {
    return {
      type: "scatter",
      name: foo.agentSymbol,
      x: convertMinutesIntoDateTime(firstTs, foo.eventTimesMinutes),
      y: foo.creditsTimeline,
      hovertemplate: `<b>${foo.agentSymbol}</b><br><b>Credits: </b>%{y:,d}<br><b>Date: </b>%{x}<extra></extra>`, // the empty extra-thingy disables the rendering of the trace-name in the hover info.
      hoverinfo: "x+y",
      marker: {
        color: sortedAndColoredLeaderboard.find((l) => l.agentSymbol === foo.agentSymbol)?.displayColor ?? "black",
      },
    };
  });

  const agentShipCountTraces: Data[] = agentHistory.map((foo) => {
    return {
      type: "scatter",
      name: foo.agentSymbol,
      x: convertMinutesIntoDateTime(firstTs, foo.eventTimesMinutes),
      y: foo.shipCountTimeline,
      hovertemplate: `<b>${foo.agentSymbol}</b><br><b>Ships: </b>%{y:,d}<br><b>Date: </b>%{x}<extra></extra>`, // the empty extra-thingy disables the rendering of the trace-name in the hover info.
      marker: {
        color: sortedAndColoredLeaderboard.find((l) => l.agentSymbol === foo.agentSymbol)?.displayColor ?? "black",
      },
    };
  });

  const constructionMaterialTradeSymbols = _.uniqBy(constructionMaterialHistory, (cm) => cm.tradeSymbol);

  const materialTraces: {
    tradeSymbol: string;
    required: number;
    materialChartTraces: Data[];
  }[] = _.sortBy(constructionMaterialTradeSymbols, (cm) => cm.tradeSymbol).map(({ tradeSymbol, required }) => {
    return {
      tradeSymbol,
      required,
      materialChartTraces: createMaterialChartTraces(
        sortedAndColoredLeaderboard,
        tradeSymbol,
        constructionMaterialHistory,
        selectedAgents,
        firstTs,
      ),
    };
  });

  const materialChartConfigs: LineChartConfig[] = materialTraces.map(
    ({ tradeSymbol, required, materialChartTraces }) => {
      return {
        title: tradeSymbol,
        mutedColorTitle: `${required} required`,
        isLog: isLog,
        data: materialChartTraces,
      };
    },
  );

  let chartConfigs: LineChartConfig[] = [
    {
      title: "Credits",
      isLog: isLog,
      data: agentCreditsTraces,
    },
    {
      title: "Ship Count",
      isLog: isLog,
      data: agentShipCountTraces,
    },
    ...materialChartConfigs,
  ];

  return <div className="w-full grid grid-cols-1  md:grid-cols-2">{chartConfigs.map(renderLineChart)}</div>;
}

type LineChartConfig = {
  title: string;
  mutedColorTitle?: string;
  isLog: boolean;
  data: Data[];
};

function renderLineChart({ isLog, mutedColorTitle, title, data }: LineChartConfig) {
  return (
    <div key={title}>
      <div className="flex flex-row">
        <h3 className="text-sm font-bold">{title}</h3>
        {mutedColorTitle ? <p className="text-sm text-muted-foreground">&nbsp; | &nbsp;</p> : <></>}
        {mutedColorTitle ? <p className="text-sm text-muted-foreground">{mutedColorTitle}</p> : <></>}
      </div>
      <Plot
        className="w-full"
        data={data}
        layout={{
          // remove margin reserved for title area
          margin: {
            l: 50,
            r: 50,
            b: 50,
            t: 50,
            //pad: 4,
          },
          modebar: { orientation: "h" },
          showlegend: false,
          legend: { orientation: "h" },

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
            tickformat: "%H:%M \n%-b %-d", // using a newline instead of <br> for the 2nd row (month and day). That way plotly diffs the current tick-value with the previous one and only renders when the value changed
            tickangle: 0,
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
        config={{ displayModeBar: false, responsive: true }}
      />
    </div>
  );
}
