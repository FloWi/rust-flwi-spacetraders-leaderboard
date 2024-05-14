import {
  ColumnSort,
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  RowSelectionState,
  useReactTable,
} from "@tanstack/react-table";
import { UiLeaderboardEntry } from "../lib/leaderboard-helper.ts";
import { compactNumberFmt } from "../lib/formatters.ts";

const columnHelper = createColumnHelper<UiLeaderboardEntry>();
export const columns = [
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

      return <span className="border-2 w-4 h-4 rounded inline-block" style={style} />;
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

export function createLeaderboardTable(
  memoizedLeaderboard: {
    sortedAndColoredLeaderboard: UiLeaderboardEntry[];
  },
  setRowSelection: (value: ((prevState: RowSelectionState) => RowSelectionState) | RowSelectionState) => void,
  sorting: ColumnSort[],
  rowSelection: RowSelectionState,
  setSorting: (value: ((prevState: ColumnSort[]) => ColumnSort[]) | ColumnSort[]) => void,
) {
  return useReactTable({
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
}
