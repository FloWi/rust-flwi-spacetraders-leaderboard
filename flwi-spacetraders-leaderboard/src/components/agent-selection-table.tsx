import {
  ColumnSort,
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  RowSelectionState,
  useReactTable,
} from "@tanstack/react-table";
import {compactNumberFmt} from "../lib/formatters.ts";
import {chartColors} from "../utils/chartColors.ts";
import {ApiLeaderboardEntry} from "../../generated";

const columnHelper = createColumnHelper<ApiLeaderboardEntry>();
export const columns = [
  columnHelper.accessor((row) => row.agentSymbol, {
    cell: (info) => {
      /*
                      span(
                  cls := "border border-2 w-4 h-4 rounded inline-block",
                  borderColor(if (agentSelection.contains(agent)) "transparent" else col),
                  backgroundColor(if (agentSelection.contains(agent)) col else "transparent"),
                  //                    eventListener,
                )

       */
      /*
      FOO  2M   [ ]
      BAR  1M   [x]
      BAZ  0.5M [x]
      QUX  0.4M [ ]

       */

      let selectedAgents = info.table.getSelectedRowModel().rows.map((r) => r.id);
      let myIndex = selectedAgents.findIndex((a) => a === info.row.id);
      let isSelected = info.row.getIsSelected();
      //console.log("rowId", info.row.id, "selectedAgents", selectedAgents, "myIndex", myIndex, "isSelected", isSelected);
      let hexColor = isSelected ? chartColors[myIndex % chartColors.length] : "darkgray";
      let style = {
        borderColor: isSelected ? "transparent" : hexColor,
        backgroundColor: isSelected ? hexColor : "transparent",
      };

      return <span className="border-2 w-4 h-4 rounded inline-block" style={style}/>;
    },
    id: "selected",
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
    leaderboard: ApiLeaderboardEntry[];
  },
  setRowSelection: (value: ((prevState: RowSelectionState) => RowSelectionState) | RowSelectionState) => void,
  sorting: ColumnSort[],
  rowSelection: RowSelectionState,
  setSorting: (value: ((prevState: ColumnSort[]) => ColumnSort[]) | ColumnSort[]) => void,
) {
  return useReactTable({
    data: memoizedLeaderboard.leaderboard,
    columns,
    getRowId: (row) => row.agentSymbol,
    onRowSelectionChange: setRowSelection, //hoist up the row selection state to your own scope
    state: {sorting, rowSelection},
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    debugTable: true,
  });
}
