import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { GetLeaderboardForResetResponseContent } from "../../../generated";

import { RowSelectionState, SortingState } from "@tanstack/react-table";
import React, { useEffect } from "react";
import Plot from "react-plotly.js";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  jumpGateMostRecentProgressQueryOptions,
  leaderboardQueryOptions,
  resetDatesQueryOptions,
} from "../../utils/queryOptions.ts";
import * as _ from "lodash";
import { AgentSelectionSheetPage } from "../../components/agent-selection-sheet-page.tsx";
import { useLeaderboardTable } from "../../components/agent-selection-table.tsx";
import { chartColors } from "../../utils/chartColors.ts";

type AgentSelectionSearch = {
  agents?: string[];
};

export const Route = createFileRoute("/resets/$resetDate/leaderboard")({
  component: LeaderboardComponent,
  pendingComponent: () => <div>Loading...</div>,
  staticData: {
    customData: "I'm the leaderboard route",
  },

  loaderDeps: ({ search: { agents } }) => ({ agents }),
  beforeLoad: async (arg) => {
    console.log("before load:");
    const selectedAgents = arg.search.agents ?? [];

    const options = leaderboardQueryOptions(arg.params.resetDate);

    const queryClient = arg.context.queryClient;
    const queryCache = queryClient.getQueryCache();
    const query = queryCache.find<GetLeaderboardForResetResponseContent>({
      queryKey: options.queryKey,
    });

    const entries = query?.state.data?.leaderboardEntries ?? [];
    const agentsInCache = entries.map((e) => e.agentSymbol);

    const needsInvalidation = selectedAgents.some((a) => !agentsInCache.includes(a));
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
    queryClient.prefetchQuery(jumpGateMostRecentProgressQueryOptions(resetDate));

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

function renderBarChart({ title, mutedColorTitle, isLog, xValues, yValues, colors }: BarChartConfig) {
  return (
    <div key={title}>
      <div className="flex flex-row gap-0.5 items-center ">
        <h3 className="text-xl font-bold">{title}</h3>
        {mutedColorTitle ? <p className="text-sm text-muted-foreground">&nbsp; | &nbsp;</p> : <></>}
        {mutedColorTitle ? <p className="text-sm text-muted-foreground">{mutedColorTitle}</p> : <></>}
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
            color: "darkgray",
          },
          paper_bgcolor: "rgba(0,0,0,0)",
          plot_bgcolor: "rgba(0,0,0,0)",

          xaxis: {
            showline: true,
            linecolor: "darkgray",
          },

          yaxis: {
            type: isLog ? "log" : "linear",
            tick0: 0,
            // dtick: 1,
            zeroline: true,
            showline: false,
            linecolor: "darkgray",
            gridcolor: "darkgray",
            hoverformat: ",d",
            tickformat: ".2s", // d3.format(".2s")(42e6) // SI-prefix with two significant digits, "42M" https://d3js.org/d3-format
          },
        }}
        config={{ displayModeBar: false, responsive: true }}
      />
    </div>
  );
}

function LeaderboardComponent() {
  const { resetDate } = Route.useParams();
  const resetDateToUse = resetDate;
  const [sortingLeaderboard, setSortingLeaderboard] = React.useState<SortingState>([
    {
      id: "credits",
      desc: true,
    },
  ]);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({}); //manage your own row selection state

  const { data: leaderboardData } = useSuspenseQuery(leaderboardQueryOptions(resetDate));
  const { data: jumpGateMostRecentConstructionProgress } = useSuspenseQuery(
    jumpGateMostRecentProgressQueryOptions(resetDate),
  );
  // const { data: resetDates } = useSuspenseQuery(resetDatesQueryOptions);
  const leaderboardEntries = leaderboardData.leaderboardEntries;
  const { agents } = Route.useSearch(); //leaderboardEntries.map((e) => e.agentSymbol);

  const [isLog, setIsLog] = React.useState(true);

  const current = { leaderboard: leaderboardEntries };

  const memoizedLeaderboard = React.useMemo(() => {
    const selectedAgents: Record<string, boolean> = {};
    agents?.forEach((agentSymbol) => (selectedAgents[agentSymbol] = true));

    setRowSelection(selectedAgents);
    return { leaderboard: current.leaderboard };
  }, [current.leaderboard, agents]);

  const { relevantEntries } = React.useMemo(() => {
    const selectedAgents = Object.keys(rowSelection);

    const relevantEntries = memoizedLeaderboard.leaderboard.filter((e) => selectedAgents.includes(e.agentSymbol));

    return { selectedAgents, relevantEntries };
  }, [rowSelection, memoizedLeaderboard.leaderboard]);

  const agentChartConfigs: BarChartConfig[] = React.useMemo(() => {
    const colors = relevantEntries.map((_, idx) => chartColors[idx % chartColors.length]);
    const xValues = relevantEntries.map((e) => e.agentSymbol);
    const yValuesCredits = relevantEntries.map((e) => e.credits);
    const yValuesShips = relevantEntries.map((e) => e.shipCount);

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
  }, [isLog, relevantEntries]);

  const materialProgressChartData: BarChartConfig[] = React.useMemo(() => {
    const relevantJumpGates = _.uniq(relevantEntries.map((r) => r.jumpGateWaypointSymbol));
    const constructionMaterialTradeSymbols = _.uniqBy(
      jumpGateMostRecentConstructionProgress.progressEntries,
      (cm) => cm.tradeSymbol,
    );

    const relevantConstructionProgressEntries = jumpGateMostRecentConstructionProgress.progressEntries.filter(
      ({ jumpGateWaypointSymbol }) => {
        return relevantJumpGates.includes(jumpGateWaypointSymbol);
      },
    );

    return _.sortBy(constructionMaterialTradeSymbols, (cm) => cm.tradeSymbol).map(({ tradeSymbol, required }) => {
      const materialEntries = relevantConstructionProgressEntries.filter((cpe) => cpe.tradeSymbol === tradeSymbol);

      const fulfilledValues = relevantEntries.map((r) => {
        return materialEntries.find((cme) => cme.jumpGateWaypointSymbol === r.jumpGateWaypointSymbol)?.fulfilled ?? 0;
      });

      return {
        title: tradeSymbol,
        mutedColorTitle: `${required} required`,
        xValues: relevantEntries.map((r) => r.agentSymbol),
        yValues: fulfilledValues,
        isLog,
        colors: relevantEntries.map((_, idx) => chartColors[idx % chartColors.length]),
      };
    });
  }, [isLog, jumpGateMostRecentConstructionProgress.progressEntries, relevantEntries]);
  const table = useLeaderboardTable(
    memoizedLeaderboard,
    setRowSelection,
    sortingLeaderboard,
    rowSelection,
    setSortingLeaderboard,
  );

  const navigate = useNavigate({ from: Route.fullPath });

  useEffect(() => {
    const newAgentSelection = Object.keys(rowSelection);

    //fire-and-forget promise call seems to be ok? YOLO
    navigate({
      search: () => ({
        agents: newAgentSelection,
      }),
    });
  }, [resetDateToUse, rowSelection, navigate]);

  const selectAgents = (newSelectedAgents: string[]) => {
    const newSelection: RowSelectionState = newSelectedAgents.reduce((o, key) => ({ ...o, [key]: true }), {});
    setRowSelection((_) => newSelection);
  };

  const chartConfigs = [...agentChartConfigs, ...materialProgressChartData];

  return (
    <>
      <AgentSelectionSheetPage
        title="Leaderboard"
        isLog={isLog}
        setIsLog={setIsLog}
        selectedAgents={agents ?? []}
        setSelectedAgents={selectAgents}
        memoizedLeaderboard={memoizedLeaderboard}
        jumpGateMostRecentConstructionProgress={jumpGateMostRecentConstructionProgress.progressEntries}
        table={table}
      >
        {agents?.length ?? 0 > 0 ? (
          <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-y-6">{chartConfigs.map(renderBarChart)}</div>
        ) : (
          <div>Please select some agents</div>
        )}
      </AgentSelectionSheetPage>
    </>
  );
}
