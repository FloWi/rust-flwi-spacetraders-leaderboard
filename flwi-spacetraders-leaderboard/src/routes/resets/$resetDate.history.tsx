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
import {capitalize, parseInt} from "lodash";
import {AgentSelectionSheetPage} from "../../components/agent-selection-sheet-page.tsx";
import {createLeaderboardTable} from "../../components/agent-selection-table.tsx";
import {RowSelectionState, SortingState} from "@tanstack/react-table";
import {
  AllSelectionModes,
  defaultRangeSelection,
  predefinedRanges,
  RangeSelection,
  SelectionMode,
} from "../../utils/rangeSelection.ts";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "../../@/components/ui/select.tsx";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "../../@/components/ui/card.tsx";
import {renderKvPair} from "../../lib/key-value-card-helper.tsx";

type AgentSelectionSearch = {
  agents?: string[];
  selectionMode: SelectionMode;
  hoursLte: number;
  hoursGte?: number;
  logAxis?: boolean;
};

export const Route = createFileRoute("/resets/$resetDate/history")({
  component: HistoryComponent,
  pendingComponent: () => <div>Loading...</div>,

  staticData: {customData: "I'm the history route"},

  validateSearch: (search: Record<string, unknown>): AgentSelectionSearch => {
    // validate and parse the search params into a typed state

    let inputSelectionMode = search?.selectionMode as SelectionMode;
    let selectionMode = AllSelectionModes.includes(inputSelectionMode)
      ? inputSelectionMode
      : defaultRangeSelection.selectionMode;

    return {
      agents: search?.agents as string[],
      selectionMode,
      hoursLte: (search?.hoursLte as number) || defaultRangeSelection.hoursLte,
      hoursGte: search?.hoursGte as number,
      logAxis: (search?.logAxis as boolean) || true,
    };
  },

  loaderDeps: ({search: {agents, selectionMode, hoursLte, hoursGte}}) => ({
    agents,
    selectionMode,
    hoursLte,
    hoursGte,
  }),

  beforeLoad: async (arg) => {
    console.log("before load:");
    let selectedAgents = _.sortBy(_.uniq(arg.search.agents ?? []));

    let rangeSelection = {
      selectionMode: arg.search.selectionMode,
      hoursLte: arg.search.hoursLte,
      hoursGte: arg.search.hoursGte,
    };

    let preciseOptions = preciseHistoryQueryOptions(arg.params.resetDate, selectedAgents, rangeSelection);

    let queryClient = arg.context.queryClient;
    const queryCache = queryClient.getQueryCache();
    const preciseQuery = queryCache.find<GetHistoryDataForResetResponseContent>({
      queryKey: preciseOptions.queryKey,
    });

    if (preciseQuery) {
      let agentsInCache = _.sortBy(_.uniq(preciseQuery.state.data?.requestedAgents ?? []));

      console.log(`found exact match for agents ${agentsInCache}- no need to refresh/fetch anything`);
    } else {
      let existingQueries: Array<Query> = queryCache.findAll({
        queryKey: historyBaseQueryKey(arg.params.resetDate, rangeSelection),
      });

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

  loader: async ({
                   params: {resetDate},
                   context: {queryClient},
                   deps: {agents, selectionMode, hoursLte, hoursGte},
                 }) => {
    // intentional fire-and-forget according to docs :-/
    // https://tanstack.com/query/latest/docs/framework/react/guides/prefetching#router-integration

    let rangeSelection = {selectionMode, hoursLte, hoursGte};

    await queryClient.ensureQueryData(leaderboardQueryOptions(resetDate));
    await queryClient.ensureQueryData(preciseHistoryQueryOptions(resetDate, agents ?? [], rangeSelection));
    await queryClient.ensureQueryData(jumpGateMostRecentProgressQueryOptions(resetDate));
    await queryClient.prefetchQuery(resetDatesQueryOptions);
  },
});

function prettyPrintRangeDuration(hours: number): string {
  let oneWeek = 7 * 24;
  let oneDay = 24;
  if (hours % oneWeek === 0) {
    let res = hours / oneWeek;

    return `${res === 1 ? "" : res} week` + (res !== 1 ? "s" : "");
  } else if (hours % oneDay === 0) {
    let res = hours / oneDay;
    return `${res === 1 ? "" : res} day` + (res !== 1 ? "s" : "");
  } else {
    let res = hours;
    return `${res === 1 ? "" : res} hour` + (res !== 1 ? "s" : "");
  }
}

function prettyPrintRangeSelection(rangeSelection: RangeSelection): React.ReactNode {
  return rangeSelection.hoursGte
    ? `${capitalize(rangeSelection.selectionMode)} ${prettyPrintRangeDuration(rangeSelection.hoursGte)} - ${prettyPrintRangeDuration(rangeSelection.hoursLte)} of reset`
    : `${capitalize(rangeSelection.selectionMode)} ${prettyPrintRangeDuration(rangeSelection.hoursLte)} of reset`;
}

function bestMatchingQuery(queryCache: QueryCache, existingQueries: Array<Query>, selectedAgents: string[]) {
  return existingQueries.map((q) => {
    let typedQuery = queryCache.find<GetHistoryDataForResetResponseContent>({queryKey: q.queryKey});
    let agents = _.sortedUniq(typedQuery?.state.data?.requestedAgents ?? []);
    let intersection = _.intersection(selectedAgents, agents);
    let isMatch = _.isEqual(selectedAgents, intersection);
    return {typedQuery, agents, intersection, isMatch};
  });
}

function rangeSelectionComponent(
  rangeSelectionFromQueryParams: RangeSelection,
  selectPredefinedRange: (rangeSelectionIndex: number) => void,
): React.ReactNode {
  let items = predefinedRanges.map((r, idx) => {
    let key = `${idx}`;
    return (
      <SelectItem key={key} value={idx.toString()}>
        {prettyPrintRangeSelection(r)}
      </SelectItem>
    );
  });

  let predefinedIdx = predefinedRanges.findIndex((r) => {
    // isEqual doesn't work here, because the runtime version `rangeSelectionFromQueryParams` doesn't have the hoursGte property.
    // The compile-time version from the list of predefined range _does_ have the property and there it is undefined
    // using isMatch (with the args in the correct order!) compares correctly.
    // I really miss scala :'-(
    //
    // example
    // console.log("comparing values", r, rangeSelectionFromQueryParams, result);
    // comparing values
    // Object { selectionMode: "first", hoursLte: 12 }
    //
    // Object { selectionMode: "first", hoursLte: 12, hoursGte: undefined }
    return _.isMatch(rangeSelectionFromQueryParams, r);
  });

  let maybePredefinedIdx = predefinedIdx >= 0 ? predefinedIdx : undefined;

  return (
    <Select
      value={maybePredefinedIdx?.toString()}
      onValueChange={(idxStr) => {
        let parsed = Number(idxStr);
        if (!isNaN(parsed)) {
          selectPredefinedRange(parsed);
        }
      }}
    >
      <SelectTrigger className="w-fit">
        <SelectValue placeholder="Select Range"/>
      </SelectTrigger>
      <SelectContent>{items}</SelectContent>
    </Select>
  );
}

function HistoryComponent() {
  const {resetDate} = Route.useParams();
  const {agents, selectionMode, hoursLte, hoursGte} = Route.useSearch();

  let rangeSelectionFromSearchParams: RangeSelection = {selectionMode, hoursLte, hoursGte};

  const {data: resetDates} = useQuery(resetDatesQueryOptions);
  const {data: historyData} = useQuery(
    preciseHistoryQueryOptions(resetDate, agents ?? [], rangeSelectionFromSearchParams),
  );
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

  let selectedReset: ApiResetDateMeta | undefined = useMemo(() => {
    return resetDates?.find((r) => r.resetDate === resetDate);
  }, [resetDate, resetDates]);

  let charts = useMemo(() => {
    let agentHistory = historyData?.agentHistory.filter((h) => agents?.includes(h.agentSymbol)) ?? [];
    let constructionMaterialHistory = historyData?.constructionMaterialHistory ?? []; //TODO: filter construction entries based on agents

    return renderTimeSeriesCharts(
      isLog,
      agentHistory,
      constructionMaterialHistory,
      memoizedLeaderboard.sortedAndColoredLeaderboard,
      agents ?? [],
      selectedReset,
    );
  }, [resetDate, historyData, isLog]);

  const navigate = useNavigate({from: Route.fullPath});

  useEffect(() => {
    let newAgentSelection = Object.keys(rowSelection);

    //fire-and-forget promise call seems to be ok? YOLO
    navigate({
      search: () => ({
        agents: newAgentSelection,
        selectionMode,
        logAxis: isLog,
        hoursLte,
        hoursGte,
      }),
    });
  }, [resetDate, rowSelection, isLog]);

  const selectPredefinedRange = (rangeSelectionIndex: number) => {
    let maybePredefinedRange = predefinedRanges.at(rangeSelectionIndex);

    if (maybePredefinedRange) {
      navigate({
        search: (old) => ({
          ...old,
          selectionMode: maybePredefinedRange.selectionMode,
          hoursLte: maybePredefinedRange.hoursLte,
          hoursGte: maybePredefinedRange.hoursGte,
        }),
      });
    }
  };

  const selectAgents = (newSelectedAgents: string[]) => {
    const newSelection: RowSelectionState = newSelectedAgents.reduce((o, key) => ({...o, [key]: true}), {});
    setRowSelection((_) => newSelection);
  };

  const table = createLeaderboardTable(memoizedLeaderboard, setRowSelection, sorting, rowSelection, setSorting);

  let agentsWithData = historyData?.agentHistory.map((h) => h.agentSymbol) ?? [];
  const agentsWithMissingData = _.difference(agents, agentsWithData);
  const noDataMessage =
    agentsWithMissingData.length > 0
      ? `No data for ${agentsWithMissingData.length} agent(s) in this period: ${agentsWithMissingData.join(", ")}`
      : undefined;

  selectedReset?.isOngoing;

  return (
    <AgentSelectionSheetPage
      title="History"
      isLog={isLog}
      setIsLog={setIsLog}
      selectedAgents={agents ?? []}
      setSelectedAgents={selectAgents}
      memoizedLeaderboard={memoizedLeaderboard}
      jumpGateMostRecentConstructionProgress={jumpGateMostRecentConstructionProgress?.progressEntries ?? []}
      table={table}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-row w-full">
          <h3 className="text-xl font-bold">Displaying {prettyPrintRangeSelection(rangeSelectionFromSearchParams)}</h3>
          <div className="ml-auto">
            {rangeSelectionComponent(rangeSelectionFromSearchParams, selectPredefinedRange)}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{`Displaying charts for ${agentsWithData.length} agent(s). ${noDataMessage ?? ""}`}</p>
        {charts}
        <p className="text-sm text-muted-foreground">
          Zoom by dragging on area the charts. Individual agents can be (de)selected by clicking on the item in the
          legend. Clicking on an item in the legend toggles its visibility - a double-click isolates that trace.
        </p>
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
      mode: "lines+markers",

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
      mode: "lines+markers",
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

  const agentShipCountTraces: Data[] = agentHistory.map((ahe) => {
    return {
      type: "scatter",
      mode: "lines+markers",
      name: ahe.agentSymbol,
      x: convertMinutesIntoDateTime(firstTs, ahe.eventTimesMinutes),
      y: ahe.shipCountTimeline,
      hovertemplate: `<b>${ahe.agentSymbol}</b><br><b>Ships: </b>%{y:,d}<br><b>Date: </b>%{x}<extra></extra>`, // the empty extra-thingy disables the rendering of the trace-name in the hover info.
      marker: {
        color: sortedAndColoredLeaderboard.find((l) => l.agentSymbol === ahe.agentSymbol)?.displayColor ?? "black",
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
  let chartGridLineColor = "rgb(102,102,108)";

  return (
    <div key={title} className="touch-manipulation">
      <div className="flex flex-row items-center">
        <h3 className="text-lg font-bold">{title}</h3>
        {mutedColorTitle ? <p className="text-sm text-muted-foreground">&nbsp; | &nbsp;</p> : <></>}
        {mutedColorTitle ? <p className="text-sm text-muted-foreground">{mutedColorTitle}</p> : <></>}
      </div>
      <Plot
        className="w-full"
        data={data}
        layout={{
          //hovermode: "x unified", // this would show the tooltip for _all_ agents, but it doesn't sort them nicely.
          hovermode: "closest",
          // remove margin reserved for title area
          margin: {
            l: 50,
            r: 50,
            b: 50,
            t: 50,
            //pad: 4,
          },
          modebar: {orientation: "h"},
          showlegend: true,
          legend: {orientation: "h"},

          height: 750,
          font: {
            size: 10,
            color: chartGridLineColor,
          },
          paper_bgcolor: "rgba(0,0,0,100)",
          plot_bgcolor: "rgba(0,0,0,0)",

          xaxis: {
            showline: true,
            linecolor: chartGridLineColor,
            gridcolor: chartGridLineColor,
            tickformat: "%H:%M \n%-b %-d", // using a newline instead of <br> for the 2nd row (month and day). That way plotly diffs the current tick-value with the previous one and only renders when the value changed
            tickangle: 0,
          },

          yaxis: {
            type: isLog ? "log" : "linear",
            tick0: 0,
            zeroline: true,
            showline: false,
            linecolor: chartGridLineColor,
            gridcolor: chartGridLineColor,
            hoverformat: ",d",
            tickformat: ".2s", // d3.format(".2s")(42e6) // SI-prefix with two significant digits, "42M" https://d3js.org/d3-format
          },
        }}
        config={{displayModeBar: false, responsive: true /*doubleClickDelay: 500*/}}
      />
    </div>
  );
}
