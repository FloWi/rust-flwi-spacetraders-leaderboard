import {
  allTimeConstructionLeaderboardColumns,
  AllTimeConstructionLeaderboardEntry,
} from "../utils/constructionLeaderboardTables.tsx";
import { getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";

type NumberPropertyKeys<T> = {
  [K in keyof T]: T[K] extends number ? K : never;
}[keyof T];

function filterByKey<T>(collection: T[], key: NumberPropertyKeys<T>, filterValueLte: number): T[] {
  console.log(`Filtering by property: "${String(key)}"`);

  return collection.filter((d) => (d[key] as number) <= filterValueLte);
}

export function useConstructionTable(
  relevantData: AllTimeConstructionLeaderboardEntry[],
  rankField: NumberPropertyKeys<AllTimeConstructionLeaderboardEntry>,
  maxRankFilter: number | undefined,
  pinnedColumns: Array<keyof AllTimeConstructionLeaderboardEntry>,
) {
  const filteredData = useMemo(() => {
    return maxRankFilter ? filterByKey(relevantData, rankField, maxRankFilter) : relevantData;
  }, [relevantData, rankField, maxRankFilter]);

  const initialSorting = useMemo(
    () => [
      { id: "resetDate", desc: true },
      { id: String(rankField), desc: false },
    ],
    [rankField],
  );

  return useReactTable({
    defaultColumn: {
      size: 45,
    },
    data: filteredData,
    enableRowSelection: false,
    columns: allTimeConstructionLeaderboardColumns,
    //getRowId: (row) => `${row}-${row.tradeSymbol}`,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    debugTable: true,
    initialState: {
      columnPinning: {
        left: pinnedColumns,
      },
      sorting: initialSorting,
    },
  });
}
