import {createFileRoute, useNavigate} from "@tanstack/react-router";
import {
  historyBaseQueryKey,
  jumpGateMostRecentProgressQueryOptions,
  leaderboardQueryOptions,
  preciseHistoryQueryOptions,
  resetDatesQueryOptions,
} from "../../utils/queryOptions.ts";
import {Query, QueryCache, useQuery, useSuspenseQuery} from "@tanstack/react-query";
import Plot from "react-plotly.js";
import React, {useEffect, useMemo} from "react";
import {
  ApiAgentHistoryEntry,
  ApiConstructionMaterialHistoryEntry,
  ApiResetDateMeta,
  GetHistoryDataForResetResponseContent,
} from "../../../generated";
import {Data} from "plotly.js";
import {calcSortedAndColoredLeaderboard, UiLeaderboardEntry} from "../../lib/leaderboard-helper.ts";
import * as _ from "lodash";
import {AgentSelectionSheetPage} from "../../components/agent-selection-sheet-page.tsx";
import {createLeaderboardTable} from "../../components/agent-selection-table.tsx";
import {RowSelectionState, SortingState} from "@tanstack/react-table";

type AgentSelectionSearch = {
  agents?: string[];
};

export const Route = createFileRoute("/resets/$resetDate/history")({
  component: HistoryComponent,
  pendingComponent: () => <div>Loading...</div>,

  staticData: {customData: "I'm the history route"},

  validateSearch: (search: Record<string, unknown>): AgentSelectionSearch => {
    // validate and parse the search params into a typed state
    return {
      agents: search?.agents as string[],
    };
  },

  loaderDeps: ({search: {agents}}) => ({agents}),

  beforeLoad: async (arg) => {
    console.log("before load:");
    let selectedAgents = _.sortBy(_.uniq(arg.search.agents ?? []));

    let preciseOptions = preciseHistoryQueryOptions(arg.params.resetDate, selectedAgents);

    let queryClient = arg.context.queryClient;
    const queryCache = queryClient.getQueryCache();
    const preciseQuery = queryCache.find<GetHistoryDataForResetResponseContent>({
      queryKey: preciseOptions.queryKey,
    });

    if (preciseQuery) {
      let agentsInCache = _.sortBy(_.uniq(preciseQuery.state.data?.requestedAgents ?? []));

      console.log(`found exact match for agents ${agentsInCache}- no need to refresh/fetch anything`);
    } else {
      let existingQueries: Array<Query> = queryCache.findAll({queryKey: historyBaseQueryKey(arg.params.resetDate)});

      let queryEvaluationResults = bestMatchingQuery(queryCache, existingQueries, selectedAgents);
      console.log("queryEvaluationResults", queryEvaluationResults);
      let maybeMatch = queryEvaluationResults.find((r) => r.isMatch);
      if (maybeMatch) {
        // found match
        console.log("found query that already contains all selected agents. Adding query to cache");
        console.log("selectedAgents", selectedAgents);
        console.log("matching query", maybeMatch.typedQuery);
        let matchingQuery = maybeMatch.typedQuery;
        let entry: GetHistoryDataForResetResponseContent | undefined = matchingQuery?.state?.data;
        let modifiedEntry = entry
          ? {
            ...entry,
            requestedAgents: selectedAgents,
            agentHistory: entry.agentHistory.filter((h) => selectedAgents.includes(h.agentSymbol)),
            //TODO: filter construction entries
          }
          : undefined;
        queryClient.setQueryData(preciseOptions.queryKey, modifiedEntry, {
          updatedAt: matchingQuery?.state.dataUpdatedAt,
        });
      } else {
        console.log("no matching and intersecting query found");
      }
    }
  },

  loader: async ({params: {resetDate}, context: {queryClient}, deps: {agents}}) => {
    // intentional fire-and-forget according to docs :-/
    // https://tanstack.com/query/latest/docs/framework/react/guides/prefetching#router-integration

    await queryClient.ensureQueryData(leaderboardQueryOptions(resetDate));
    await queryClient.ensureQueryData(preciseHistoryQueryOptions(resetDate, agents ?? []));
    await queryClient.ensureQueryData(jumpGateMostRecentProgressQueryOptions(resetDate));
    await queryClient.prefetchQuery(resetDatesQueryOptions);
  },
});

function bestMatchingQuery(queryCache: QueryCache, existingQueries: Array<Query>, selectedAgents: string[]) {
  return existingQueries.map((q) => {
    let typedQuery = queryCache.find<GetHistoryDataForResetResponseContent>({queryKey: q.queryKey});
    let agents = _.sortedUniq(typedQuery?.state.data?.requestedAgents ?? []);
    let intersection = _.intersection(selectedAgents, agents);
    let isMatch = _.isEqual(selectedAgents, intersection);
    return {typedQuery, agents, intersection, isMatch};
  });
}

function HistoryComponent() {
  const {resetDate} = Route.useParams();
  const {agents} = Route.useSearch();

  const {data: resetDates} = useQuery(resetDatesQueryOptions);
  const {data: historyDataFromCache} = useQuery(preciseHistoryQueryOptions(resetDate, agents ?? []));
  const {data: jumpGateMostRecentConstructionProgress} = useQuery(jumpGateMostRecentProgressQueryOptions(resetDate));
  const [isLog, setIsLog] = React.useState(true);

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({}); //manage your own row selection state

  const {data: leaderboardData} = useSuspenseQuery(leaderboardQueryOptions(resetDate));
  // const { data: resetDates } = useSuspenseQuery(resetDatesQueryOptions);
  const leaderboardEntries = leaderboardData.leaderboardEntries;

  let current = {leaderboard: leaderboardEntries};

  let memoizedLeaderboard = React.useMemo(() => {
    let selectedAgents: Record<string, boolean> = {};
    agents?.forEach((agentSymbol) => (selectedAgents[agentSymbol] = true));

    setRowSelection(selectedAgents);
    return calcSortedAndColoredLeaderboard(current.leaderboard);
  }, [current.leaderboard]);

  let selectedReset = useMemo(() => {
    return resetDates?.find((r) => r.resetDate === resetDate);
  }, [resetDate, resetDates]);

  let charts = useMemo(() => {
    let agentHistory = historyDataFromCache?.agentHistory.filter((h) => agents?.includes(h.agentSymbol)) ?? [];
    let constructionMaterialHistory = historyDataFromCache?.constructionMaterialHistory ?? []; //TODO: filter construction entries based on agents

    console.log(`creating charts for selected agents`, agents);
    console.log(
      `dataset contains these agents`,
      agentHistory.map((h) => h.agentSymbol),
    );
    return renderTimeSeriesCharts(
      isLog,
      agentHistory,
      constructionMaterialHistory,
      memoizedLeaderboard.sortedAndColoredLeaderboard,
      agents ?? [],
      selectedReset,
    );
  }, [resetDate, historyDataFromCache, isLog]);

  const navigate = useNavigate({from: Route.fullPath});

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
    const newSelection: RowSelectionState = newSelectedAgents.reduce((o, key) => ({...o, [key]: true}), {});
    setRowSelection((_) => newSelection);
  };

  const table = createLeaderboardTable(memoizedLeaderboard, setRowSelection, sorting, rowSelection, setSorting);

  let agentsWithData = historyDataFromCache?.agentHistory.map((h) => h.agentSymbol) ?? [];
  const agentsWithMissingData = _.difference(agents, agentsWithData);
  const noDataMessage =
    agentsWithMissingData.length > 0
      ? `No data for ${agentsWithMissingData.length} agent(s) in this period: ${agentsWithMissingData.join(", ")}`
      : undefined;

  return (
    <AgentSelectionSheetPage
      title={`History for Reset ${resetDate}`}
      isLog={isLog}
      setIsLog={setIsLog}
      selectedAgents={agents ?? []}
      setSelectedAgents={selectAgents}
      memoizedLeaderboard={memoizedLeaderboard}
      jumpGateMostRecentConstructionProgress={jumpGateMostRecentConstructionProgress?.progressEntries ?? []}
      table={table}
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{`Displaying charts for ${agentsWithData.length} agent(s). ${noDataMessage ?? ""}`}</p>

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
        return {...lb, rank: idx + 1};
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
  agentHistory: Array<ApiAgentHistoryEntry>,
  constructionMaterialHistory: Array<ApiConstructionMaterialHistoryEntry>,
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
  }[] = _.sortBy(constructionMaterialTradeSymbols, (cm) => cm.tradeSymbol).map(({tradeSymbol, required}) => {
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
    ({tradeSymbol, required, materialChartTraces}) => {
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

function renderLineChart({isLog, mutedColorTitle, title, data}: LineChartConfig) {
  return (
    <div key={title}>
      <div className="flex flex-row items-center">
        <h3 className="text-lg font-bold">{title}</h3>
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
          modebar: {orientation: "h"},
          showlegend: false,
          legend: {orientation: "h"},

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
        config={{displayModeBar: false, responsive: true}}
      />
    </div>
  );
}
