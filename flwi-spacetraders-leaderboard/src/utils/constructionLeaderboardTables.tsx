import {createColumnHelper} from "@tanstack/react-table";
import {ApiAllTimeConstructionLeaderboardEntry, ApiResetDateMeta} from "../../generated";
import {prettyDuration} from "../lib/formatters.ts";

export interface AllTimeConstructionLeaderboardEntry extends ApiAllTimeConstructionLeaderboardEntry {
  resetDate: ApiResetDateMeta;
}

const columnHelperAllTimeConstructionData = createColumnHelper<AllTimeConstructionLeaderboardEntry>();

/*
agentsInSystem
durationMinutesJumpGateConstruction
durationMinutesStartFortnightFinishJumpGateConstruction
durationMinutesStartFortnightStartJumpGateConstruction
jumpGateWaypointSymbol
rankJumpGateConstruction
rankStartFortnightFinishJumpGateConstruction
rankStartFortnightStartJumpGateConstruction
reset
tsFinishJumpGateConstruction
tsStartJumpGateConstruction
tsStartOfReset
 */

export const allTimeConstructionLeaderboardColumns = [
  columnHelperAllTimeConstructionData.accessor("resetDate", {
    header: "Reset Date",
    cell: (info) => info.getValue().resetDate,
    footer: (info) => info.column.id,
    size: 125,
    invertSorting: true, //something is wrong with the sorting of the resetDate. Tanstack Table thinks 2024-01-01 > 2024-02-02. Most likely I'm using it wrong.
  }),
  columnHelperAllTimeConstructionData.accessor(
    (row) => {
      return row.durationMinutesJumpGateConstruction
        ? prettyDuration(row.durationMinutesJumpGateConstruction * 60 * 1000)
        : "---";
    },
    {
      id: "durationJumpGateConstruction",
      header: "Duration Jump Gate Construction",
      cell: (info) => <pre>{info.getValue()}</pre>,
      meta: {
        align: "right",
      },
    },
  ),
  columnHelperAllTimeConstructionData.accessor("rankJumpGateConstruction", {
    header: "Rank Jump Gate Construction",
    cell: (info) => info.getValue(),
    footer: (info) => info.column.id,
  }),
  columnHelperAllTimeConstructionData.accessor(
    (row) => {
      return row.durationMinutesStartFortnightStartJumpGateConstruction
        ? prettyDuration(row.durationMinutesStartFortnightStartJumpGateConstruction * 60 * 1000)
        : "---";
    },
    {
      id: "durationMinutesStartFortnightStartJumpGateConstruction",
      header: "Duration Start Fortnight - Start Jump Gate Construction",
      cell: (info) => <pre>{info.getValue()}</pre>,
      meta: {
        align: "right",
      },
    },
  ),
  columnHelperAllTimeConstructionData.accessor("rankStartFortnightStartJumpGateConstruction", {
    header: "Rank Start Fortnight - Start Jump Gate Construction",
    cell: (info) => info.getValue(),
    footer: (info) => info.column.id,
  }),

  columnHelperAllTimeConstructionData.accessor("rankStartFortnightFinishJumpGateConstruction", {
    header: "Rank Start Fortnight - Finish Jump Gate Construction",
    cell: (info) => info.getValue(),
    footer: (info) => info.column.id,
  }),
  columnHelperAllTimeConstructionData.accessor(
    (row) => {
      return row.durationMinutesStartFortnightFinishJumpGateConstruction
        ? prettyDuration(row.durationMinutesStartFortnightFinishJumpGateConstruction * 60 * 1000)
        : "---";
    },
    {
      id: "durationMinutesStartFortnightFinishJumpGateConstruction",
      header: "Duration Start Fortnight - Finish Jump Gate Construction",
      cell: (info) => <pre>{info.getValue()}</pre>,
      meta: {
        align: "right",
      },
    },
  ),
];
