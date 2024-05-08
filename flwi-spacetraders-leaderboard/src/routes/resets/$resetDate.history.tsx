import { createFileRoute } from "@tanstack/react-router";
import {
  historyQueryOptions,
  leaderboardQueryOptions,
  resetDatesQueryOptions,
} from "../../utils/queryOptions.ts";
import { useSuspenseQuery } from "@tanstack/react-query";
import Plot from "react-plotly.js";
import React from "react";
import {
  ApiAgentHistoryEntry,
  ApiConstructionMaterialHistoryEntry,
  GetHistoryDataForResetResponseContent,
} from "../../../generated";
import { Data } from "plotly.js";
import {
  calcSortedAndColoredLeaderboard,
  UiLeaderboardEntry,
} from "../../lib/leaderboard-helper.ts";

type AgentSelectionSearch = {
  selectedAgents?: string[];
};

export const Route = createFileRoute("/resets/$resetDate/history")({
  component: HistoryComponent,
  pendingComponent: () => <div>Loading...</div>,
  staticData: { customData: "I'm the history route" },

  validateSearch: (search: Record<string, unknown>): AgentSelectionSearch => {
    // validate and parse the search params into a typed state
    return {
      selectedAgents: search?.selectedAgents as string[],
    };
  },

  loaderDeps: ({ search: { selectedAgents } }) => ({ selectedAgents }),

  loader: async ({
    params: { resetDate },
    context: { queryClient },
    deps: { selectedAgents },
  }) => {
    // intentional fire-and-forget according to docs :-/
    // https://tanstack.com/query/latest/docs/framework/react/guides/prefetching#router-integration
    queryClient.prefetchQuery(
      historyQueryOptions(resetDate, selectedAgents ?? []),
    );

    queryClient.prefetchQuery(leaderboardQueryOptions(resetDate));

    await queryClient.prefetchQuery(resetDatesQueryOptions);
  },
});

function HistoryComponent() {
  const { resetDate } = Route.useParams();
  const { selectedAgents } = Route.useSearch();

  const { data: resetDates } = useSuspenseQuery(resetDatesQueryOptions);
  const { data: historyData } = useSuspenseQuery(
    historyQueryOptions(resetDate, selectedAgents ?? []),
  );

  const { data: leaderboardData } = useSuspenseQuery(
    leaderboardQueryOptions(resetDate),
  );
  // const { data: resetDates } = useSuspenseQuery(resetDatesQueryOptions);
  const leaderboardEntries = leaderboardData.leaderboardEntries;

  let current = { leaderboard: leaderboardEntries };

  let memoizedLeaderboard = React.useMemo(() => {
    //select top 10 by default
    let selectedAgentsRecord: Record<string, boolean> = {};

    // // haven't found a way to convert an array into a record
    // sortedEntries.slice(0, 10).forEach((e) => {
    //   selectedAgents[e.agentSymbol] = true;
    // });
    selectedAgents?.forEach(
      (agentSymbol) => (selectedAgentsRecord[agentSymbol] = true),
    );

    //setRowSelection(selectedAgents);
    return calcSortedAndColoredLeaderboard(current.leaderboard);
  }, [current.leaderboard]);

  let charts = renderTimeSeriesCharts(
    true,
    historyData,
    memoizedLeaderboard.sortedAndColoredLeaderboard,
    selectedAgents ?? [],
  );

  return (
    <>
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
        <h2 className="text-2xl font-bold pt-4">
          Hello /reset/{resetDate}/history!
        </h2>
        {charts}
      </div>
    </>
  );
}

interface UiAgentHistoryEntry extends ApiAgentHistoryEntry {
  //selected: boolean
  displayColor: string;
}

interface UiConstructionMaterialHistoryEntry
  extends ApiConstructionMaterialHistoryEntry {
  //selected: boolean
  displayColor: string;
}

function createMaterialChartTraces(
  sortedAndColoredLeaderboard: UiLeaderboardEntry[],
  tradeGoodSymbol: string,
  constructionMaterialHistory: Array<ApiConstructionMaterialHistoryEntry>,
  selectedAgents: string[],
): Data[] {
  let relevantHistoryEntries = constructionMaterialHistory.filter(
    (h) => h.tradeSymbol === tradeGoodSymbol,
  );

  let relevantSortedAndColoredLeaderboard = sortedAndColoredLeaderboard.filter(
    (lb) => selectedAgents.includes(lb.agentSymbol),
  );

  return relevantHistoryEntries.map((h) => {
    let color =
      relevantSortedAndColoredLeaderboard.find(
        (lb) => lb.jumpGateWaypointSymbol === h.jumpGateWaypointSymbol,
      )?.displayColor ?? "black";

    let agentsInThisSystem = sortedAndColoredLeaderboard
      .map((lb, idx) => {
        return { ...lb, rank: idx + 1 };
      })
      .filter((lb) => lb.jumpGateWaypointSymbol === h.jumpGateWaypointSymbol)
      .map((lb) => lb);

    let agentsDescription = agentsInThisSystem
      .map((a) => `${a.rank}. ${a.agentSymbol}`)
      .join(", ");

    return {
      type: "scatter",
      name: `${h.jumpGateWaypointSymbol}: (${agentsInThisSystem.length} agent(s)\n${agentsDescription})`,
      x: h.eventTimesMinutes,
      y: h.fulfilled,
      marker: {
        color,
      },
    };
  });
}

function renderTimeSeriesCharts(
  isLog: boolean,
  {
    agentHistory,
    constructionMaterialHistory,
  }: GetHistoryDataForResetResponseContent,
  sortedAndColoredLeaderboard: UiLeaderboardEntry[],
  selectedAgents: string[],
) {
  const agentCreditsTraces: Data[] = agentHistory.map((foo) => {
    return {
      type: "scatter",
      name: foo.agentSymbol,
      x: foo.eventTimesMinutes,
      y: foo.creditsTimeline,
      marker: {
        color:
          sortedAndColoredLeaderboard.find(
            (l) => l.agentSymbol === foo.agentSymbol,
          )?.displayColor ?? "black",
      },
      hoverlabel: null,
      hovertemplate: null,
    };
  });

  const agentShipCountTraces: Data[] = agentHistory.map((foo) => {
    return {
      type: "scatter",
      name: foo.agentSymbol,
      x: foo.eventTimesMinutes,
      y: foo.shipCountTimeline,
      marker: {
        color:
          sortedAndColoredLeaderboard.find(
            (l) => l.agentSymbol === foo.agentSymbol,
          )?.displayColor ?? "black",
      },
    };
  });

  const constructionMaterialTradeSymbols = Array.from(
    new Set(constructionMaterialHistory.map((e) => e.tradeSymbol)),
  ).toSorted();

  const materialTraces: { tradeGood: string; materialChartTraces: Data[] }[] =
    constructionMaterialTradeSymbols.map((tradeGood) => {
      return {
        tradeGood,
        materialChartTraces: createMaterialChartTraces(
          sortedAndColoredLeaderboard,
          tradeGood,
          constructionMaterialHistory,
          selectedAgents,
        ),
      };
    });

  const materialCharts = materialTraces.map(
    ({ tradeGood, materialChartTraces }) => {
      return (
        <div>
          <h3 className="text-sm font-bold">{tradeGood}</h3>
          <Plot
            className="w-full"
            data={materialChartTraces}
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
              showlegend: true,
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
              },

              yaxis: {
                type: "linear",
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
    },
  );

  return (
    <div className="w-full grid grid-cols-1  md:grid-cols-2">
      <div>
        <h3 className="text-sm font-bold">
          Credits {isLog ? "(log axis)" : ""}
        </h3>
        <Plot
          className="w-full"
          data={agentCreditsTraces}
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
            showlegend: true,
            legend: { orientation: "h" },
            height: 500,
            font: {
              size: 10,
              color: "lightgray",
            },
            paper_bgcolor: "rgba(0,0,0,0)",
            plot_bgcolor: "rgba(0,0,0,0)",
            // hoverlabel: {
            //   bgcolor: "rgba(0,0,0,0)",
            // },

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
          config={{ displayModeBar: false, responsive: true }}
        />
      </div>
      <div>
        <h3 className="text-sm font-bold">Ship Count</h3>

        <Plot
          className="w-full"
          data={agentShipCountTraces}
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
            showlegend: true,
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
            },

            yaxis: {
              type: "linear",
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
      {materialCharts}
    </div>
  );
}
