import {createFileRoute} from "@tanstack/react-router";
import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import React, {JSX, useMemo} from "react";
import {prettyTable} from "../../components/prettyTable.tsx";
import {ApiJumpGateAssignmentEntry, CrateService} from "../../../generated";
import {queryOptions, useSuspenseQuery} from "@tanstack/react-query";
import {ResetHeaderBar} from "../../components/resetHeaderBar.tsx";
import {Separator} from "../../@/components/ui/separator.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../@/components/ui/card.tsx";
import {
  aggregateJumpGateStats,
  aggregateMaterialsSummary,
  ConstructionProgressEntry,
  extractSystemSymbol,
  MaterialSummary,
  mockDataConstructionProgress,
  rawData,
} from "../../lib/constructionHelper.ts";

import {durationMillis} from "../../lib/utils.ts";
import {
  dateFmt,
  intNumberFmt,
  percentNumberFmt,
  prettyDuration,
} from "../../lib/formatters.ts";

const columnHelperConstructionOverview =
  createColumnHelper<ConstructionProgressEntry>();
const columnHelperJumpGateAssignment =
  createColumnHelper<ApiJumpGateAssignmentEntry>();

const columns = [
  columnHelperConstructionOverview.accessor("jumpGateWaypointSymbol", {
    cell: (info) => info.getValue(),
    footer: (info) => info.column.id,
  }),
  columnHelperConstructionOverview.accessor("isJumpGateComplete", {
    cell: (info) => info.getValue(),
    footer: (info) => info.column.id,
  }),
  columnHelperConstructionOverview.accessor("tradeSymbol", {
    cell: (info) => info.getValue(),
    footer: (info) => info.column.id,
  }),
  columnHelperConstructionOverview.accessor("fulfilled", {
    cell: (info) => intNumberFmt.format(info.getValue()),
    footer: (info) => info.column.id,
    meta: {
      align: "right",
    },
  }),
  columnHelperConstructionOverview.accessor("required", {
    cell: (info) => intNumberFmt.format(info.getValue()),
    footer: (info) => info.column.id,
    meta: {
      align: "right",
    },
  }),
  columnHelperConstructionOverview.accessor(
    (row) => `${percentNumberFmt.format(row.fulfilled / row.required)}`,
    {
      id: "completed",
      meta: {
        align: "right",
      },
    },
  ),
  columnHelperConstructionOverview.accessor("tsFirstConstructionEvent", {
    header: "First Construction Event",
    cell: (info) => dateFmt.format(info.getValue()),
    footer: (info) => info.column.id,
    sortingFn: "datetime",
    size: 200,
    meta: {
      align: "right",
    },
  }),
  columnHelperConstructionOverview.accessor(
    (row) => durationMillis(row.tsStartOfReset, row.tsFirstConstructionEvent),
    {
      id: "durationStartResetFirstConstructionEvent",
      header: "Start Fortnight --> FirstConstruction",
      cell: (info) => <pre>{prettyDuration(info.getValue())}</pre>,
      meta: {
        align: "right",
      },
    },
  ),
  columnHelperConstructionOverview.accessor("tsLastConstructionEvent", {
    header: "Last Construction Event",
    cell: (info) => {
      // beware: formatting null returns 01/01/190 - formatting undefined return current date :facepalm:
      return info.getValue() ? dateFmt.format(info.getValue()) : "";
    },
    footer: (info) => info.column.id,
    sortingFn: "datetime",
    sortUndefined: -1,
    size: 200,
    meta: {
      align: "right",
    },
  }),
  columnHelperConstructionOverview.accessor(
    (row) =>
      row.tsLastConstructionEvent
        ? durationMillis(row.tsStartOfReset, row.tsLastConstructionEvent)
        : undefined,

    {
      id: "durationStartResetLastConstructionEvent",
      header: "Start Fortnight --> Last Construction",
      cell: (info) => {
        let v = info.getValue();
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
        ? durationMillis(
          row.tsFirstConstructionEvent,
          row.tsLastConstructionEvent,
        )
        : undefined,
    {
      id: "durationConstruction",
      header: "Duration Construction",
      cell: (info) => {
        let v = info.getValue();
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
    size: 250,
  }),
  columnHelperJumpGateAssignment.accessor((row) => row.agentsInSystem.length, {
    id: "numAgentsInSystem",
    header: "Num Agents",
    cell: (info) => info.getValue(),
    sortUndefined: -1,
    size: 200,
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

export const jumpGateQueryOptions = (resetDate: string) =>
  queryOptions({
    queryKey: ["jumpGateData", resetDate],
    queryFn: () => CrateService.getJumpGateAgentsAssignment({resetDate}),
  });

export const Route = createFileRoute("/resets/$resetDate/jump-gate")({
  component: JumpGateComponent,
  loader: async ({
                   //deps: { agents },
                   params: {resetDate},
                   context: {queryClient},
                 }) => {
    let options = jumpGateQueryOptions(resetDate);
    return queryClient.ensureQueryData(options);
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
          {renderKvPair(
            "Started Construction",
            jumpGateSummary.numJumpGatesWithStartedProduction,
          )}
          {renderKvPair(
            "Finished Construction",
            jumpGateSummary.numCompletedJumpGates,
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function JumpGateComponent(): JSX.Element {
  const {resetDate} = Route.useParams();

  const [sortingConstruction, setSortingConstruction] =
    React.useState<SortingState>([]);

  const [sortingAssignment, setSortingAssignment] =
    React.useState<SortingState>([]);

  const {data} = useSuspenseQuery(jumpGateQueryOptions(resetDate));

  let constructionProgressData = mockDataConstructionProgress.filter(
    (d) => d.reset === resetDate,
  );

  const jumpGateSummary = useMemo(() => {
    return aggregateJumpGateStats(constructionProgressData, data);
  }, [data]);

  const constructionMaterialSummary = useMemo(() => {
    return aggregateMaterialsSummary(constructionProgressData);
  }, [data]);

  console.log("jumpGateAssignment", data);

  const assignmentTable = useReactTable({
    data: data.jumpGateAssignmentEntries,
    defaultColumn: {
      size: 200,
      minSize: 50,
    },
    columns: jumpGateAssignmentColumns,
    getRowId: (row) => `${row.jumpGateWaypointSymbol}`,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {sorting: sortingAssignment},
    onSortingChange: setSortingAssignment,
    debugTable: true,
  });

  const table = useReactTable({
    data: constructionProgressData,
    defaultColumn: {
      size: 200,
      minSize: 50,
    },
    columns,
    getRowId: (row) => `${row.jumpGateWaypointSymbol}-${row.tradeSymbol}`,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {sorting: sortingConstruction},
    onSortingChange: setSortingConstruction,
    debugTable: true,
  });

  return (
    <>
      <ResetHeaderBar resetDate={resetDate}/>
      <div className="flex flex-col gap-x-2 gap-y-4">
        <Separator orientation="horizontal"/>
        {renderJumpGateSummary(jumpGateSummary)}
        <Separator orientation="horizontal"/>
        <div className="flex flex-col md:flex-row gap-4">
          {constructionMaterialSummary.map(renderConstructionMaterialSummary)}
        </div>
        <h2 className="text-2xl font-bold pt-2">Gate to Agent Mapping</h2>
        {prettyTable(assignmentTable)}
        <h2 className="text-2xl font-bold pt-4">Construction Overview</h2>
        {prettyTable(table)}
        <pre>{JSON.stringify(jumpGateSummary, null, 2)}</pre>
      </div>
    </>
  );
}

const renderKvPair = (label: string, value: any) => {
  return (
    <>
      <div className="space-y-1 text-left">
        <h4 className="text-sm text-muted-foreground font-medium leading-none">
          {label}
        </h4>
        <p className="text-2xl ">{value}</p>
      </div>
    </>
  );
};

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
          {renderKvPair(
            "Best First Delivery",
            fastestFirstDeliveryMs
              ? prettyDuration(fastestFirstDeliveryMs)
              : "",
          )}
          {renderKvPair(
            "Best Last Delivery",
            fastestLastDeliveryMs ? prettyDuration(fastestLastDeliveryMs) : "",
          )}
          {renderKvPair(
            "Best Construction",
            fastestConstructionMs ? prettyDuration(fastestConstructionMs) : "",
          )}
        </div>
      </CardContent>
    </Card>
  );
};

console.log("raw data", rawData);
console.log("parsed data", mockDataConstructionProgress);
