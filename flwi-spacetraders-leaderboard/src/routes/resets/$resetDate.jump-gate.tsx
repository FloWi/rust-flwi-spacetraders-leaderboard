import { createFileRoute } from "@tanstack/react-router";
import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  RowSelectionState,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import React, { JSX, useMemo } from "react";
import { prettyTable } from "../../components/prettyTable.tsx";
import { ApiJumpGateAssignmentEntry } from "../../../generated";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Separator } from "../../@/components/ui/separator.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../@/components/ui/card.tsx";
import {
  aggregateJumpGateStats,
  aggregateMaterialsSummary,
  ConstructionProgressEntry,
  extractSystemSymbol,
  MaterialSummary,
  mockDataConstructionProgress,
} from "../../lib/constructionHelper.ts";

import { durationMillis } from "../../lib/utils.ts";
import { intNumberFmt, percentNumberFmt, prettyDuration } from "../../lib/formatters.ts";
import {
  jumpGateAssignmentsQueryOptions,
  jumpGateMostRecentProgressQueryOptions,
  leaderboardQueryOptions,
  resetDatesQueryOptions,
} from "../../utils/queryOptions.ts";
import { CircleCheckBigIcon } from "lucide-react";
import { renderKvPair } from "../../lib/key-value-card-helper.tsx";
import { AgentSelectionSheetPage } from "../../components/agent-selection-sheet-page.tsx";
import { useLeaderboardTable } from "../../components/agent-selection-table.tsx";

const columnHelperConstructionOverview = createColumnHelper<ConstructionProgressEntry>();
const columnHelperJumpGateAssignment = createColumnHelper<ApiJumpGateAssignmentEntry>();

const columns = [
  columnHelperConstructionOverview.accessor("jumpGateWaypointSymbol", {
    header: "Waypoint Symbol",
    cell: (info) => info.getValue(),
    footer: (info) => info.column.id,
  }),
  columnHelperConstructionOverview.accessor("isJumpGateComplete", {
    header: "Is Gate Complete",
    cell: (info) => (info.getValue() ? <CircleCheckBigIcon /> : <></>),
    footer: (info) => info.column.id,
  }),
  columnHelperConstructionOverview.accessor("tradeSymbol", {
    header: "TradeSymbol",
    cell: (info) => info.getValue(),
    footer: (info) => info.column.id,
  }),
  columnHelperConstructionOverview.accessor("fulfilled", {
    header: "Fulfilled",
    cell: (info) => intNumberFmt.format(info.getValue()),
    footer: (info) => info.column.id,
    meta: {
      align: "right",
    },
  }),
  columnHelperConstructionOverview.accessor("required", {
    header: "Required",
    cell: (info) => intNumberFmt.format(info.getValue()),
    footer: (info) => info.column.id,
    meta: {
      align: "right",
    },
  }),
  columnHelperConstructionOverview.accessor((row) => row.fulfilled / row.required, {
    id: "progress",
    header: "Progress",
    cell: (info) => percentNumberFmt.format(info.getValue()),
    meta: {
      align: "right",
    },
  }),
  // columnHelperConstructionOverview.accessor("tsFirstConstructionEvent", {
  //   header: "First Construction Event",
  //   cell: (info) => dateFmt.format(info.getValue()),
  //   footer: (info) => info.column.id,
  //   sortingFn: "datetime",
  //   size: 200,
  //   meta: {
  //     align: "right",
  //   },
  // }),
  columnHelperConstructionOverview.accessor((row) => durationMillis(row.tsStartOfReset, row.tsFirstConstructionEvent), {
    id: "durationStartResetFirstConstructionEvent",
    header: "Start Fortnight --> FirstConstruction",
    cell: (info) => <pre>{prettyDuration(info.getValue())}</pre>,
    meta: {
      align: "right",
    },
  }),
  // columnHelperConstructionOverview.accessor("tsLastConstructionEvent", {
  //   header: "Last Construction Event",
  //   cell: (info) => {
  //     // beware: formatting null returns 01/01/190 - formatting undefined return current date :facepalm:
  //     return info.getValue() ? dateFmt.format(info.getValue()) : "";
  //   },
  //   footer: (info) => info.column.id,
  //   sortingFn: "datetime",
  //   sortUndefined: -1,
  //   size: 200,
  //   meta: {
  //     align: "right",
  //   },
  // }),
  columnHelperConstructionOverview.accessor(
    (row) =>
      row.tsLastConstructionEvent ? durationMillis(row.tsStartOfReset, row.tsLastConstructionEvent) : undefined,

    {
      id: "durationStartResetLastConstructionEvent",
      header: "Start Fortnight --> Last Construction",
      cell: (info) => {
        const v = info.getValue();
        return <pre>{v ? prettyDuration(v) : ""}</pre>;
      },
      sortUndefined: -1,
      meta: {
        align: "right",
      },
    },
  ),
  columnHelperConstructionOverview.accessor(
    (row) =>
      row.tsLastConstructionEvent
        ? durationMillis(row.tsFirstConstructionEvent, row.tsLastConstructionEvent)
        : undefined,
    {
      id: "durationConstruction",
      header: "Duration Construction",
      cell: (info) => {
        const v = info.getValue();
        return <pre>{v ? prettyDuration(v) : ""}</pre>;
      },
      sortUndefined: -1,
      meta: {
        align: "right",
      },
    },
  ),
];

const jumpGateAssignmentColumns = [
  columnHelperJumpGateAssignment.accessor("jumpGateWaypointSymbol", {
    header: "Gate Waypoint",
    cell: (info) => extractSystemSymbol(info.getValue()),
    footer: (info) => info.column.id,
  }),
  columnHelperJumpGateAssignment.accessor((row) => row.agentsInSystem.length, {
    id: "numAgentsInSystem",
    header: "Num Agents",
    cell: (info) => info.getValue(),
    sortUndefined: -1,
    meta: {
      align: "right",
    },
  }),
  columnHelperJumpGateAssignment.accessor("agentsInSystem", {
    header: "Agents In System",
    cell: (info) =>
      info
        .getValue()
        .map((a) => a)
        .join(", "),
    size: 450,
    footer: (info) => info.column.id,
  }),
];

type AgentSelectionSearch = {
  agents?: string[];
};

export const Route = createFileRoute("/resets/$resetDate/jump-gate")({
  component: JumpGateComponent,
  pendingComponent: () => <div>Loading...</div>,
  staticData: { customData: "I'm the jump gate route" },
  loaderDeps: ({ search: { agents } }) => ({ agents }),
  validateSearch: (search: Record<string, unknown>): AgentSelectionSearch => {
    // validate and parse the search params into a typed state
    return {
      agents: search?.agents as string[],
    };
  },

  loader: async ({
    //deps: { agents },
    params: { resetDate },
    context: { queryClient },
  }) => {
    // intentional fire-and-forget according to docs :-/
    // https://tanstack.com/query/latest/docs/framework/react/guides/prefetching#router-integration
    queryClient.prefetchQuery(jumpGateAssignmentsQueryOptions(resetDate));

    return await queryClient.prefetchQuery(resetDatesQueryOptions);
  },
});

function renderJumpGateSummary(jumpGateSummary: {
  numTrackedAgents: number;
  numCompletedJumpGates: number;
  numTrackedJumpGates: number;
  numJumpGatesWithStartedProduction: number;
}) {
  return (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Jump Gate Summary</CardTitle>
        <CardDescription>Overview gate construction</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 w-fit gap-6">
          {renderKvPair("Tracked Agents", jumpGateSummary.numTrackedAgents)}
          {renderKvPair("Tracked Gates", jumpGateSummary.numTrackedJumpGates)}
          {renderKvPair("Started Construction", jumpGateSummary.numJumpGatesWithStartedProduction)}
          {renderKvPair("Finished Construction", jumpGateSummary.numCompletedJumpGates)}
        </div>
      </CardContent>
    </Card>
  );
}

function JumpGateComponent(): JSX.Element {
  const { resetDate } = Route.useParams();
  const { agents } = Route.useSearch();

  const [sortingLeaderboard, setSortingLeaderboard] = React.useState<SortingState>([
    {
      id: "credits",
      desc: true,
    },
  ]);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({}); //manage your own row selection state

  const [sortingConstruction, setSortingConstruction] = React.useState<SortingState>([
    {
      id: "tradeSymbol",
      desc: false,
    },
    {
      id: "progress",
      desc: true,
    },
  ]);

  const [sortingAssignment, setSortingAssignment] = React.useState<SortingState>([
    {
      id: "numAgentsInSystem",
      desc: true,
    },
    {
      id: "agentsInSystem",
      desc: false,
    },
  ]);

  const { data: leaderboardData } = useSuspenseQuery(leaderboardQueryOptions(resetDate));

  const leaderboardEntries = leaderboardData.leaderboardEntries;

  const { data: jumpGateMostRecentConstructionProgress } = useSuspenseQuery(
    jumpGateMostRecentProgressQueryOptions(resetDate),
  );

  const { data: jumpGateData } = useSuspenseQuery(jumpGateAssignmentsQueryOptions(resetDate));
  //const {data: resetDates} = useSuspenseQuery(resetDatesQueryOptions);

  const current = { leaderboard: leaderboardEntries };

  const memoizedLeaderboard = React.useMemo(() => {
    const selectedAgents: Record<string, boolean> = {};
    agents?.forEach((agentSymbol) => (selectedAgents[agentSymbol] = true));

    setRowSelection(selectedAgents);
    return { leaderboard: current.leaderboard };
  }, [current.leaderboard, agents]);

  const constructionProgressData = useMemo(() => {
    return mockDataConstructionProgress.filter((d) => d.reset === resetDate);
  }, [resetDate]);

  const jumpGateSummary = useMemo(() => {
    return aggregateJumpGateStats(constructionProgressData, jumpGateData);
  }, [jumpGateData, constructionProgressData]);

  const constructionMaterialSummary = useMemo(() => {
    return aggregateMaterialsSummary(constructionProgressData);
  }, [constructionProgressData]);

  console.log("jumpGateAssignment", jumpGateData);

  const leaderboardTable = useLeaderboardTable(
    memoizedLeaderboard,
    setRowSelection,
    sortingLeaderboard,
    rowSelection,
    setSortingLeaderboard,
  );

  const assignmentTable = useReactTable({
    data: jumpGateData.jumpGateAssignmentEntries,
    enableRowSelection: false,
    columns: jumpGateAssignmentColumns,
    getRowId: (row) => `${row.jumpGateWaypointSymbol}`,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { sorting: sortingAssignment },
    onSortingChange: setSortingAssignment,
    debugTable: true,
  });

  const constructionProgressTable = useReactTable({
    data: constructionProgressData,
    enableRowSelection: false,
    columns,
    getRowId: (row) => `${row.jumpGateWaypointSymbol}-${row.tradeSymbol}`,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { sorting: sortingConstruction },
    onSortingChange: setSortingConstruction,
    debugTable: true,
  });
  const [isLog, setIsLog] = React.useState(true);

  const selectAgents = (newSelectedAgents: string[]) => {
    console.log("??? selectAgents: newSelectedAgents:", newSelectedAgents);
  };

  return (
    <>
      <AgentSelectionSheetPage
        title="Jump Gate Overview"
        isLog={isLog}
        setIsLog={setIsLog}
        selectedAgents={agents ?? []}
        setSelectedAgents={selectAgents}
        memoizedLeaderboard={memoizedLeaderboard}
        jumpGateMostRecentConstructionProgress={jumpGateMostRecentConstructionProgress.progressEntries}
        table={leaderboardTable}
      >
        <div className="flex flex-col gap-x-2 gap-y-4 lg:p-6">
          <Separator orientation="horizontal" />
          {renderJumpGateSummary(jumpGateSummary)}
          <Separator orientation="horizontal" />
          <div className="flex flex-col md:flex-row gap-4">
            {constructionMaterialSummary.map(renderConstructionMaterialSummary)}
          </div>
          <h2 className="text-2xl font-bold pt-2">Gate to Agent Mapping</h2>
          {prettyTable(assignmentTable)}
          <h2 className="text-2xl font-bold pt-4 h-fit">Construction Overview</h2>
          {prettyTable(constructionProgressTable)}
        </div>
      </AgentSelectionSheetPage>
    </>
  );
}

const renderConstructionMaterialSummary = ({
  tradeSymbol,
  numStartedDeliveries,
  numCompletedDeliveries,
  fastestFirstDeliveryMs,
  fastestLastDeliveryMs,
  fastestConstructionMs,
}: MaterialSummary) => {
  return (
    <Card key={`material-summary-${tradeSymbol}`} className="w-[350px]">
      <CardHeader>
        <CardTitle>{tradeSymbol}</CardTitle>
        <CardDescription>Overview of material deliveries</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 w-fit gap-4 pt-2">
          {renderKvPair("Started Deliveries", numStartedDeliveries)}
          {renderKvPair("Completed Deliveries", numCompletedDeliveries)}
          {renderKvPair("Best First Delivery", fastestFirstDeliveryMs ? prettyDuration(fastestFirstDeliveryMs) : "")}
          {renderKvPair("Best Last Delivery", fastestLastDeliveryMs ? prettyDuration(fastestLastDeliveryMs) : "")}
          {renderKvPair("Best Construction", fastestConstructionMs ? prettyDuration(fastestConstructionMs) : "")}
        </div>
      </CardContent>
    </Card>
  );
};
