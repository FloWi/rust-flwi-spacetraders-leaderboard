import { createFileRoute } from "@tanstack/react-router";
import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import React, { JSX } from "react";
import { prettyTable } from "../../components/prettyTable.tsx";
import { Duration } from "luxon";
import { ApiJumpGateAssignmentEntry, CrateService } from "../../../generated";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

const prettyDuration = (durationMs: number) => {
  let d = Duration.fromMillis(durationMs);
  return d.toFormat("d'd' hh:mm");
};

const columnHelperConstructionOverview =
  createColumnHelper<ConstructionProgressEntry>();
const columnHelperJumpGateAssignment =
  createColumnHelper<ApiJumpGateAssignmentEntry>();
let intNumberFmt = new Intl.NumberFormat();
let percentNumberFmt = new Intl.NumberFormat(undefined, {
  style: "percent",
  minimumFractionDigits: 1,
});

let dateTimeFormatOptions: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hour12: false,
};
let dateFmt = new Intl.DateTimeFormat(undefined, dateTimeFormatOptions);

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
    header: "Jump Gate Waypoint Symbol",
    cell: (info) => info.getValue(),
    footer: (info) => info.column.id,
    size: 250,
  }),
  columnHelperJumpGateAssignment.accessor((row) => row.agentsInSystem.length, {
    id: "numberOfAgentsInSystem",
    header: "Number Of Agents In System",
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
    queryFn: () => CrateService.getJumpGateAgentsAssignment({ resetDate }),
  });

export const Route = createFileRoute("/resets/$resetDate/jump-gate")({
  component: JumpGateComponent,
  loader: async ({
    //deps: { agents },
    params: { resetDate },
    context: { queryClient },
  }) => {
    let options = jumpGateQueryOptions(resetDate);
    return queryClient.ensureQueryData(options);
  },
});

function JumpGateComponent(): JSX.Element {
  const { resetDate } = Route.useParams();

  const [sortingConstruction, setSortingConstruction] =
    React.useState<SortingState>([]);
  const [sortingAssignment, setSortingAssignment] =
    React.useState<SortingState>([]);

  const { data } = useSuspenseQuery(jumpGateQueryOptions(resetDate));

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
    state: { sorting: sortingAssignment },
    onSortingChange: setSortingAssignment,
    debugTable: true,
  });

  const table = useReactTable({
    data: mockDataConstructionProgress,
    defaultColumn: {
      size: 200,
      minSize: 50,
    },
    columns,
    getRowId: (row) => `${row.jumpGateWaypointSymbol}-${row.tradeSymbol}`,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { sorting: sortingConstruction },
    onSortingChange: setSortingConstruction,
    debugTable: true,
  });

  return (
    <>
      <div className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold pt-4">
          Jump Gate to Agents Assignment
        </h2>
        {prettyTable(assignmentTable)}
        <h2 className="text-2xl font-bold pt-4">Construction Overview</h2>
        {prettyTable(table)}
        <pre>{JSON.stringify(mockDataConstructionProgress, null, 2)}</pre>
      </div>
    </>
  );
}

interface ConstructionProgressEntryRaw {
  reset: string;
  tsStartOfReset: string;
  tsLatestEntryOfReset: string;
  tradeSymbol: string;
  fulfilled: number;
  required: number;
  jumpGateWaypointSymbol: string;
  tsFirstConstructionEvent: string;
  tsLastConstructionEvent?: string;
  isJumpGateComplete: boolean;
}

interface ConstructionProgressEntry {
  reset: string;
  tsStartOfReset: Date;
  tsLatestEntryOfReset: Date;
  tradeSymbol: string;
  fulfilled: number;
  required: number;
  jumpGateWaypointSymbol: string;
  tsFirstConstructionEvent: Date;
  tsLastConstructionEvent?: Date;
  isJumpGateComplete: boolean;
}

function durationMillis(from: Date, to: Date): number {
  return to.getTime() - from.getTime();
}

function convert(e: ConstructionProgressEntryRaw): ConstructionProgressEntry {
  return {
    ...e,
    tsStartOfReset: new Date(e.tsStartOfReset),
    tsLatestEntryOfReset: new Date(e.tsLatestEntryOfReset),
    tsFirstConstructionEvent: new Date(e.tsFirstConstructionEvent),
    tsLastConstructionEvent: e.tsLastConstructionEvent
      ? new Date(e.tsLastConstructionEvent)
      : undefined,
  };
}

const mockDataConstructionProgressStr = `
[{"resetId":2,"reset":"2024-04-09","tsStartOfReset":"2024-04-09 15:25:00.337863","tsLatestEntryOfReset":"2024-04-24 14:15:00.637172","tradeSymbol":"FAB_MATS","fulfilled":4000,"required":4000,"jumpGateWaypointSymbol":"X1-BR51-I56","tsFirstConstructionEvent":"2024-04-12 20:35:00.519176","tsLastConstructionEvent":"2024-04-23 20:40:00.587351","isJumpGateComplete":1},{"resetId":2,"reset":"2024-04-09","tsStartOfReset":"2024-04-09 15:25:00.337863","tsLatestEntryOfReset":"2024-04-24 14:15:00.637172","tradeSymbol":"ADVANCED_CIRCUITRY","fulfilled":1200,"required":1200,"jumpGateWaypointSymbol":"X1-BR51-I56","tsFirstConstructionEvent":"2024-04-12 22:35:00.951440","tsLastConstructionEvent":"2024-04-24 07:00:00.831316","isJumpGateComplete":1},{"resetId":2,"reset":"2024-04-09","tsStartOfReset":"2024-04-09 15:25:00.337863","tsLatestEntryOfReset":"2024-04-24 14:15:00.637172","tradeSymbol":"FAB_MATS","fulfilled":1880,"required":4000,"jumpGateWaypointSymbol":"X1-DB41-I54","tsFirstConstructionEvent":"2024-04-11 09:55:00.477789","tsLastConstructionEvent":null,"isJumpGateComplete":0},{"resetId":2,"reset":"2024-04-09","tsStartOfReset":"2024-04-09 15:25:00.337863","tsLatestEntryOfReset":"2024-04-24 14:15:00.637172","tradeSymbol":"ADVANCED_CIRCUITRY","fulfilled":1200,"required":1200,"jumpGateWaypointSymbol":"X1-DB41-I54","tsFirstConstructionEvent":"2024-04-11 10:35:00.863964","tsLastConstructionEvent":"2024-04-15 22:55:00.366614","isJumpGateComplete":0},{"resetId":2,"reset":"2024-04-09","tsStartOfReset":"2024-04-09 15:25:00.337863","tsLatestEntryOfReset":"2024-04-24 14:15:00.637172","tradeSymbol":"FAB_MATS","fulfilled":4000,"required":4000,"jumpGateWaypointSymbol":"X1-FA45-I45","tsFirstConstructionEvent":"2024-04-11 07:50:00.834261","tsLastConstructionEvent":"2024-04-17 15:00:00.688536","isJumpGateComplete":1},{"resetId":2,"reset":"2024-04-09","tsStartOfReset":"2024-04-09 15:25:00.337863","tsLatestEntryOfReset":"2024-04-24 14:15:00.637172","tradeSymbol":"ADVANCED_CIRCUITRY","fulfilled":1200,"required":1200,"jumpGateWaypointSymbol":"X1-FA45-I45","tsFirstConstructionEvent":"2024-04-11 06:15:00.368337","tsLastConstructionEvent":"2024-04-15 00:05:00.449297","isJumpGateComplete":1},{"resetId":2,"reset":"2024-04-09","tsStartOfReset":"2024-04-09 15:25:00.337863","tsLatestEntryOfReset":"2024-04-24 14:15:00.637172","tradeSymbol":"ADVANCED_CIRCUITRY","fulfilled":860,"required":1200,"jumpGateWaypointSymbol":"X1-KT64-I57","tsFirstConstructionEvent":"2024-04-21 08:30:00.388920","tsLastConstructionEvent":null,"isJumpGateComplete":0},{"resetId":2,"reset":"2024-04-09","tsStartOfReset":"2024-04-09 15:25:00.337863","tsLatestEntryOfReset":"2024-04-24 14:15:00.637172","tradeSymbol":"FAB_MATS","fulfilled":4000,"required":4000,"jumpGateWaypointSymbol":"X1-PQ10-I57","tsFirstConstructionEvent":"2024-04-10 01:35:00.528810","tsLastConstructionEvent":"2024-04-19 00:00:00.705321","isJumpGateComplete":1},{"resetId":2,"reset":"2024-04-09","tsStartOfReset":"2024-04-09 15:25:00.337863","tsLatestEntryOfReset":"2024-04-24 14:15:00.637172","tradeSymbol":"ADVANCED_CIRCUITRY","fulfilled":1200,"required":1200,"jumpGateWaypointSymbol":"X1-PQ10-I57","tsFirstConstructionEvent":"2024-04-09 23:10:00.573254","tsLastConstructionEvent":"2024-04-14 03:40:00.999404","isJumpGateComplete":1},{"resetId":2,"reset":"2024-04-09","tsStartOfReset":"2024-04-09 15:25:00.337863","tsLatestEntryOfReset":"2024-04-24 14:15:00.637172","tradeSymbol":"FAB_MATS","fulfilled":4000,"required":4000,"jumpGateWaypointSymbol":"X1-PX72-I56","tsFirstConstructionEvent":"2024-04-12 12:00:00.419840","tsLastConstructionEvent":"2024-04-15 13:15:00.572529","isJumpGateComplete":1},{"resetId":2,"reset":"2024-04-09","tsStartOfReset":"2024-04-09 15:25:00.337863","tsLatestEntryOfReset":"2024-04-24 14:15:00.637172","tradeSymbol":"ADVANCED_CIRCUITRY","fulfilled":1200,"required":1200,"jumpGateWaypointSymbol":"X1-PX72-I56","tsFirstConstructionEvent":"2024-04-12 13:10:00.764935","tsLastConstructionEvent":"2024-04-14 05:20:00.388659","isJumpGateComplete":1},{"resetId":2,"reset":"2024-04-09","tsStartOfReset":"2024-04-09 15:25:00.337863","tsLatestEntryOfReset":"2024-04-24 14:15:00.637172","tradeSymbol":"FAB_MATS","fulfilled":4000,"required":4000,"jumpGateWaypointSymbol":"X1-RC33-I56","tsFirstConstructionEvent":"2024-04-09 19:05:00.607018","tsLastConstructionEvent":"2024-04-11 16:15:00.718895","isJumpGateComplete":1},{"resetId":2,"reset":"2024-04-09","tsStartOfReset":"2024-04-09 15:25:00.337863","tsLatestEntryOfReset":"2024-04-24 14:15:00.637172","tradeSymbol":"ADVANCED_CIRCUITRY","fulfilled":1200,"required":1200,"jumpGateWaypointSymbol":"X1-RC33-I56","tsFirstConstructionEvent":"2024-04-10 13:35:00.393601","tsLastConstructionEvent":"2024-04-11 16:40:00.740134","isJumpGateComplete":1},{"resetId":2,"reset":"2024-04-09","tsStartOfReset":"2024-04-09 15:25:00.337863","tsLatestEntryOfReset":"2024-04-24 14:15:00.637172","tradeSymbol":"FAB_MATS","fulfilled":4000,"required":4000,"jumpGateWaypointSymbol":"X1-RF85-I54","tsFirstConstructionEvent":"2024-04-10 04:20:01.156881","tsLastConstructionEvent":"2024-04-11 23:05:00.283722","isJumpGateComplete":1},{"resetId":2,"reset":"2024-04-09","tsStartOfReset":"2024-04-09 15:25:00.337863","tsLatestEntryOfReset":"2024-04-24 14:15:00.637172","tradeSymbol":"ADVANCED_CIRCUITRY","fulfilled":1200,"required":1200,"jumpGateWaypointSymbol":"X1-RF85-I54","tsFirstConstructionEvent":"2024-04-10 07:45:00.580990","tsLastConstructionEvent":"2024-04-11 15:35:00.791295","isJumpGateComplete":1},{"resetId":2,"reset":"2024-04-09","tsStartOfReset":"2024-04-09 15:25:00.337863","tsLatestEntryOfReset":"2024-04-24 14:15:00.637172","tradeSymbol":"FAB_MATS","fulfilled":4000,"required":4000,"jumpGateWaypointSymbol":"X1-SS19-I58","tsFirstConstructionEvent":"2024-04-10 06:25:00.341153","tsLastConstructionEvent":"2024-04-12 15:15:00.816850","isJumpGateComplete":1},{"resetId":2,"reset":"2024-04-09","tsStartOfReset":"2024-04-09 15:25:00.337863","tsLatestEntryOfReset":"2024-04-24 14:15:00.637172","tradeSymbol":"ADVANCED_CIRCUITRY","fulfilled":1200,"required":1200,"jumpGateWaypointSymbol":"X1-SS19-I58","tsFirstConstructionEvent":"2024-04-10 07:10:00.350198","tsLastConstructionEvent":"2024-04-11 19:45:00.411264","isJumpGateComplete":1},{"resetId":2,"reset":"2024-04-09","tsStartOfReset":"2024-04-09 15:25:00.337863","tsLatestEntryOfReset":"2024-04-24 14:15:00.637172","tradeSymbol":"ADVANCED_CIRCUITRY","fulfilled":80,"required":1200,"jumpGateWaypointSymbol":"X1-UN59-I55","tsFirstConstructionEvent":"2024-04-19 17:30:00.430900","tsLastConstructionEvent":null,"isJumpGateComplete":0},{"resetId":2,"reset":"2024-04-09","tsStartOfReset":"2024-04-09 15:25:00.337863","tsLatestEntryOfReset":"2024-04-24 14:15:00.637172","tradeSymbol":"FAB_MATS","fulfilled":4000,"required":4000,"jumpGateWaypointSymbol":"X1-VZ93-I60","tsFirstConstructionEvent":"2024-04-11 21:40:00.563972","tsLastConstructionEvent":"2024-04-16 04:45:00.429928","isJumpGateComplete":1},{"resetId":2,"reset":"2024-04-09","tsStartOfReset":"2024-04-09 15:25:00.337863","tsLatestEntryOfReset":"2024-04-24 14:15:00.637172","tradeSymbol":"ADVANCED_CIRCUITRY","fulfilled":1200,"required":1200,"jumpGateWaypointSymbol":"X1-VZ93-I60","tsFirstConstructionEvent":"2024-04-11 23:50:00.370952","tsLastConstructionEvent":"2024-04-16 02:30:00.289652","isJumpGateComplete":1},{"resetId":2,"reset":"2024-04-09","tsStartOfReset":"2024-04-09 15:25:00.337863","tsLatestEntryOfReset":"2024-04-24 14:15:00.637172","tradeSymbol":"FAB_MATS","fulfilled":4000,"required":4000,"jumpGateWaypointSymbol":"X1-XJ57-I59","tsFirstConstructionEvent":"2024-04-11 19:00:00.398866","tsLastConstructionEvent":"2024-04-19 04:05:00.547708","isJumpGateComplete":1},{"resetId":2,"reset":"2024-04-09","tsStartOfReset":"2024-04-09 15:25:00.337863","tsLatestEntryOfReset":"2024-04-24 14:15:00.637172","tradeSymbol":"ADVANCED_CIRCUITRY","fulfilled":1200,"required":1200,"jumpGateWaypointSymbol":"X1-XJ57-I59","tsFirstConstructionEvent":"2024-04-11 20:40:00.651584","tsLastConstructionEvent":"2024-04-19 20:10:00.386541","isJumpGateComplete":1},{"resetId":2,"reset":"2024-04-09","tsStartOfReset":"2024-04-09 15:25:00.337863","tsLatestEntryOfReset":"2024-04-24 14:15:00.637172","tradeSymbol":"FAB_MATS","fulfilled":40,"required":4000,"jumpGateWaypointSymbol":"X1-XR13-I51","tsFirstConstructionEvent":"2024-04-16 15:15:00.475913","tsLastConstructionEvent":null,"isJumpGateComplete":0},{"resetId":2,"reset":"2024-04-09","tsStartOfReset":"2024-04-09 15:25:00.337863","tsLatestEntryOfReset":"2024-04-24 14:15:00.637172","tradeSymbol":"FAB_MATS","fulfilled":3120,"required":4000,"jumpGateWaypointSymbol":"X1-Y4-I60","tsFirstConstructionEvent":"2024-04-16 14:15:00.366990","tsLastConstructionEvent":null,"isJumpGateComplete":0},{"resetId":2,"reset":"2024-04-09","tsStartOfReset":"2024-04-09 15:25:00.337863","tsLatestEntryOfReset":"2024-04-24 14:15:00.637172","tradeSymbol":"ADVANCED_CIRCUITRY","fulfilled":320,"required":1200,"jumpGateWaypointSymbol":"X1-Y4-I60","tsFirstConstructionEvent":"2024-04-15 11:35:00.396318","tsLastConstructionEvent":null,"isJumpGateComplete":0},{"resetId":2,"reset":"2024-04-09","tsStartOfReset":"2024-04-09 15:25:00.337863","tsLatestEntryOfReset":"2024-04-24 14:15:00.637172","tradeSymbol":"FAB_MATS","fulfilled":3640,"required":4000,"jumpGateWaypointSymbol":"X1-ZS31-I56","tsFirstConstructionEvent":"2024-04-09 21:45:01.074160","tsLastConstructionEvent":null,"isJumpGateComplete":0},{"resetId":2,"reset":"2024-04-09","tsStartOfReset":"2024-04-09 15:25:00.337863","tsLatestEntryOfReset":"2024-04-24 14:15:00.637172","tradeSymbol":"ADVANCED_CIRCUITRY","fulfilled":1200,"required":1200,"jumpGateWaypointSymbol":"X1-ZS31-I56","tsFirstConstructionEvent":"2024-04-10 00:40:00.572354","tsLastConstructionEvent":"2024-04-15 04:40:00.333511","isJumpGateComplete":0}]
`;

let rawData: ConstructionProgressEntryRaw[] = JSON.parse(
  mockDataConstructionProgressStr,
);
let mockDataConstructionProgress: ConstructionProgressEntry[] =
  rawData.map(convert);

console.log("raw data", rawData);
console.log("parsed data", mockDataConstructionProgress);
