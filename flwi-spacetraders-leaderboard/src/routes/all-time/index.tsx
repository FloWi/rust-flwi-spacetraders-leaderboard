import { createFileRoute } from "@tanstack/react-router";
import React, { useMemo } from "react";
import {
  ApiAllTimeRankEntry,
  mockDataAllTime,
} from "../../lib/all-time-testdata.ts";
import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { intNumberFmt } from "../../lib/formatters.ts";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "../../@/components/ui/toggle-group.tsx";
import { prettyTable } from "../../components/prettyTable.tsx";

export const Route = createFileRoute("/all-time/")({
  component: AllTimeComponent,
});

const columnHelperAllTimeData = createColumnHelper<ApiAllTimeRankEntry>();

const allTimeColumns = [
  columnHelperAllTimeData.accessor("reset", {
    header: "Reset Date",
    cell: (info) => info.getValue(),
    footer: (info) => info.column.id,
  }),
  columnHelperAllTimeData.accessor("agentSymbol", {
    header: "Agent Symbol",
    cell: (info) => info.getValue(),
    footer: (info) => info.column.id,
  }),
  columnHelperAllTimeData.accessor("credits", {
    header: "Credits",
    cell: (info) => intNumberFmt.format(info.getValue()),
    footer: (info) => info.column.id,
    meta: {
      align: "right",
    },
  }),
  columnHelperAllTimeData.accessor("rank", {
    header: "Rank",
    cell: (info) => info.getValue(),
    footer: (info) => info.column.id,
  }),
];

type RankFilter = { name: string; maxRank?: number };
const filters: RankFilter[] = [
  {
    name: "Top 3",
    maxRank: 3,
  },
  {
    name: "Top 10",
    maxRank: 10,
  },
  {
    name: "All",
  },
];

function AllTimeComponent() {
  let allTimeData = useMemo(() => {
    return mockDataAllTime;
  }, []);

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [currentFilter, setFilter] = React.useState<RankFilter>(filters[0]);

  let relevantData = useMemo(() => {
    return allTimeData.filter((d) =>
      currentFilter.maxRank ? d.rank <= currentFilter.maxRank : true,
    );
  }, [currentFilter]);

  const table = useReactTable({
    data: relevantData,
    enableRowSelection: false,
    columns: allTimeColumns,
    //getRowId: (row) => `${row}-${row.tradeSymbol}`,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { sorting },
    onSortingChange: setSorting,
    debugTable: true,
  });

  return (
    <>
      <ToggleGroup
        type={`single`}
        value={currentFilter.name}
        onValueChange={(value) => {
          if (value) {
            let selectedFilter = filters.find((f) => f.name === value);
            if (selectedFilter) {
              setFilter(selectedFilter);
            }
          }
        }}
      >
        {filters.map((f) => (
          <ToggleGroupItem value={f.name}>{f.name}</ToggleGroupItem>
        ))}
      </ToggleGroup>
      {prettyTable(table)}
    </>
  );
}
