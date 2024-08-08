import { createFileRoute, useNavigate } from "@tanstack/react-router";
import React, { JSX, useMemo } from "react";
import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { intNumberFmt, prettyDuration } from "../../lib/formatters.ts";
import { ToggleGroup, ToggleGroupItem } from "../../@/components/ui/toggle-group.tsx";
import { prettyTable } from "../../components/prettyTable.tsx";
import Plot from "react-plotly.js";
import { Legend, PlotType } from "plotly.js";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "../../@/components/ui/sheet.tsx";
import { HamburgerMenuIcon } from "@radix-ui/react-icons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../@/components/ui/card.tsx";
import { renderKvPair } from "../../lib/key-value-card-helper.tsx";
import { useMediaQuery } from "react-responsive";
import { Switch } from "../../@/components/ui/switch.tsx";
import { Label } from "../../@/components/ui/label.tsx";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  allTimeConstructionLeaderboardOptions,
  allTimePerformanceQueryOptions,
  resetDatesQueryOptions,
} from "../../utils/queryOptions.ts";
import { ApiAllTimePerformanceEntry, ApiResetDateMeta } from "../../../generated";
import { allTimeConstructionLeaderboardColumns } from "../../utils/constructionLeaderboardTables.tsx";

type RankFilter = { name: string; maxRank?: number };
type ResetFilter = { name: string; numberResets?: number };
type RankFilterId = "top1" | "top3" | "top5" | "top10" | "all";

const rankFilters: Map<RankFilterId, RankFilter> = new Map([
  [
    "top1",
    {
      name: "Top 1",
      maxRank: 1,
    },
  ],
  [
    "top3",
    {
      name: "Top 3",
      maxRank: 3,
    },
  ],
  [
    "top5",
    {
      name: "Top 5",
      maxRank: 5,
    },
  ],
  [
    "top10",
    {
      name: "Top 10",
      maxRank: 10,
    },
  ],
  [
    "all",
    {
      name: "All",
    },
  ],
]);

type ResetFilterId = "last3" | "last5" | "last10" | "all";

const resetFilters: Map<ResetFilterId, ResetFilter> = new Map([
  [
    "last3",
    {
      name: "Last 3",
      numberResets: 3,
    },
  ],
  [
    "last5",
    {
      name: "Last 5",
      numberResets: 5,
    },
  ],
  [
    "last10",
    {
      name: "Last 10",
      numberResets: 10,
    },
  ],
  [
    "all",
    {
      name: "All",
    },
  ],
]);

type AllTimeSelectionSearch = {
  rankFilter: RankFilterId;
  resetFilter: ResetFilterId;
  logAxis: boolean;
};

export const Route = createFileRoute("/all-time/")({
  component: AllTimeComponent,
  loader: async ({ context: { queryClient } }) => {
    queryClient.prefetchQuery(allTimePerformanceQueryOptions);
    queryClient.prefetchQuery(allTimeConstructionLeaderboardOptions);

    await queryClient.prefetchQuery(resetDatesQueryOptions);
  },
  pendingComponent: () => <div>Loading...</div>,
  validateSearch: (search: Record<string, unknown>): AllTimeSelectionSearch => {
    const resetFilterStr = search?.resetFilter as string;
    const rankFilterStr = search?.rankFilter as string;

    return {
      resetFilter: resetFilters.has(resetFilterStr as ResetFilterId) ? (resetFilterStr as ResetFilterId) : "last10",
      rankFilter: rankFilters.has(rankFilterStr as RankFilterId) ? (rankFilterStr as RankFilterId) : "top3",
      logAxis: (search?.logAxis as boolean) ?? true,
    };
  },
});

interface AllTimeRankEntry extends ApiAllTimePerformanceEntry {
  resetDate: ApiResetDateMeta;
}

const columnHelperAllTimeData = createColumnHelper<AllTimeRankEntry>();

const allTimePerformanceColumns = [
  columnHelperAllTimeData.accessor("resetDate", {
    header: "Reset Date",
    cell: (info) => info.getValue().resetDate,
    footer: (info) => info.column.id,
  }),
  columnHelperAllTimeData.accessor((row) => row.resetDate.durationMinutes * 60 * 1000, {
    id: "durationReset",
    header: "Duration Reset",
    cell: (info) => <pre>{prettyDuration(info.getValue())}</pre>,
    meta: {
      align: "right",
    },
  }),
  columnHelperAllTimeData.accessor("rank", {
    header: "Rank",
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
];

function AllTimeComponent() {
  const { data: allResetDates } = useSuspenseQuery(resetDatesQueryOptions);

  const { rankFilter, resetFilter, logAxis: isLog } = Route.useSearch();

  const navigate = useNavigate({ from: Route.fullPath });

  const { currentRankFilter, currentResetFilter } = React.useMemo(() => {
    return { currentRankFilter: rankFilters.get(rankFilter)!, currentResetFilter: resetFilters.get(resetFilter)! };
  }, [rankFilter, resetFilter]);

  const {
    data: { entries: allTimePerformanceData },
  } = useSuspenseQuery(allTimePerformanceQueryOptions);

  const {
    data: { entries: allTimeConstructionLeaderboardData },
  } = useSuspenseQuery(allTimeConstructionLeaderboardOptions);

  const resetDates = useMemo(() => {
    return allResetDates
      .map((r) => r.resetDate)
      .toSorted()
      .toReversed();
  }, [allResetDates]);

  const [allTimePerformanceSorting, setAllTimePerformanceSorting] = React.useState<SortingState>([
    {
      id: "resetDate",
      desc: true,
    },
    {
      id: "rank",
      desc: false,
    },
  ]);

  const [allTimeConstructionDurationSorting, setAllTimeConstructionDurationSorting] = React.useState<SortingState>([
    {
      id: "resetDate",
      desc: true,
    },
    {
      id: "rankJumpGateConstruction",
      desc: false,
    },
  ]);

  const [
    allTimeConstructionStartFortnightStartConstructionSorting,
    setAllTimeConstructionStartFortnightStartConstructionSorting,
  ] = React.useState<SortingState>([
    {
      id: "resetDate",
      desc: true,
    },
    {
      id: "rankStartFortnightStartJumpGateConstruction",
      desc: false,
    },
  ]);

  const [
    allTimeConstructionStartFortnightFinishConstructionSorting,
    setAllTimeConstructionStartFortnightFinishConstructionSorting,
  ] = React.useState<SortingState>([
    {
      id: "resetDate",
      desc: true,
    },
    {
      id: "rankStartFortnightFinishJumpGateConstruction",
      desc: false,
    },
  ]);

  const relevantPerformanceData: AllTimeRankEntry[] = useMemo(() => {
    const relevantResetDates = new Set(
      currentResetFilter.numberResets ? resetDates.slice(0, currentResetFilter.numberResets) : resetDates,
    );
    return allTimePerformanceData
      .filter((d) => {
        return (
          (currentRankFilter.maxRank ? d.rank <= currentRankFilter.maxRank : true) && relevantResetDates.has(d.reset)
        );
      })
      .flatMap((d) => {
        const resetMeta = allResetDates?.find((rd) => rd.resetDate === d.reset);
        return resetMeta ? [{ ...d, resetDate: resetMeta, reset: resetMeta.resetDate }] : [];
      });
  }, [currentRankFilter, currentResetFilter, allResetDates, allTimePerformanceData, resetDates]);

  const {
    constructionDurationData,
    startFortnightStartConstructionDurationData,
    startFortnightFinishConstructionDurationData,
  } = useMemo(() => {
    const relevantResetDates = new Set(
      currentResetFilter.numberResets ? resetDates.slice(0, currentResetFilter.numberResets) : resetDates,
    );
    const filteredResetData = allTimeConstructionLeaderboardData
      .filter((d) => relevantResetDates.has(d.reset))
      .flatMap((d) => {
        const resetMeta = allResetDates?.find((rd) => rd.resetDate === d.reset);
        return resetMeta ? [{ ...d, resetDate: resetMeta, reset: resetMeta.resetDate }] : [];
      });

    return {
      constructionDurationData: filteredResetData.filter((d) =>
        currentRankFilter.maxRank ? d.rankJumpGateConstruction <= currentRankFilter.maxRank : true,
      ),
      startFortnightStartConstructionDurationData: filteredResetData.filter((d) =>
        currentRankFilter.maxRank ? d.rankStartFortnightStartJumpGateConstruction <= currentRankFilter.maxRank : true,
      ),
      startFortnightFinishConstructionDurationData: filteredResetData.filter((d) =>
        currentRankFilter.maxRank ? d.rankStartFortnightFinishJumpGateConstruction <= currentRankFilter.maxRank : true,
      ),
    };
  }, [currentRankFilter, currentResetFilter, allResetDates, allTimeConstructionLeaderboardData, resetDates]);

  const allTimePerformanceTable = useReactTable({
    defaultColumn: {
      size: 25,
    },
    data: relevantPerformanceData,
    enableRowSelection: false,
    columns: allTimePerformanceColumns,
    //getRowId: (row) => `${row}-${row.tradeSymbol}`,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { sorting: allTimePerformanceSorting },
    onSortingChange: setAllTimePerformanceSorting,
    debugTable: true,
  });

  const allTimeConstructionDurationTable = useReactTable({
    defaultColumn: {
      size: 45,
    },
    data: constructionDurationData,
    enableRowSelection: false,
    columns: allTimeConstructionLeaderboardColumns,
    //getRowId: (row) => `${row}-${row.tradeSymbol}`,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { sorting: allTimeConstructionDurationSorting },
    onSortingChange: setAllTimeConstructionDurationSorting,
    debugTable: true,
    initialState: {
      columnPinning: {
        left: ["resetDate", "rankJumpGateConstruction", "durationJumpGateConstruction"],
      },
    },
  });

  const allTimeConstructionStartFortnightStartConstructionTable = useReactTable({
    defaultColumn: {
      size: 45,
    },
    data: startFortnightStartConstructionDurationData,
    enableRowSelection: false,
    columns: allTimeConstructionLeaderboardColumns,
    //getRowId: (row) => `${row}-${row.tradeSymbol}`,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { sorting: allTimeConstructionStartFortnightStartConstructionSorting },
    onSortingChange: setAllTimeConstructionStartFortnightStartConstructionSorting,
    debugTable: true,
    initialState: {
      columnPinning: {
        left: [
          "resetDate",
          "rankStartFortnightStartJumpGateConstruction",
          "durationStartFortnightStartJumpGateConstruction",
        ],
      },
    },
  });

  const allTimeConstructionStartFortnightFinishConstructionTable = useReactTable({
    defaultColumn: {
      size: 45,
    },
    data: startFortnightFinishConstructionDurationData,
    enableRowSelection: false,
    columns: allTimeConstructionLeaderboardColumns,
    //getRowId: (row) => `${row}-${row.tradeSymbol}`,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { sorting: allTimeConstructionStartFortnightFinishConstructionSorting },
    onSortingChange: setAllTimeConstructionStartFortnightFinishConstructionSorting,
    debugTable: true,
    initialState: {
      columnPinning: {
        left: [
          "resetDate",
          "rankStartFortnightFinishJumpGateConstruction",
          "durationStartFortnightFinishJumpGateConstruction",
        ],
      },
    },
  });

  const chartData = React.useMemo(() => {
    const maxRank = currentRankFilter.maxRank ?? 10;
    const resets = Array.from(new Set(relevantPerformanceData.map((d) => d.reset))).toSorted();
    const ranks = Array.from(Array(maxRank).keys()).map((r) => r + 1);

    const data = ranks.map((rank) => {
      const rankData = resets.flatMap((r) => relevantPerformanceData.filter((d) => d.reset === r && d.rank === rank));
      const yValues = rankData.map((d) => d.credits);
      const texts = rankData.map((d) => d.agentSymbol);

      return {
        type: "bar" as PlotType,
        x: resets,
        y: yValues,
        name: `#${rank}`,
        text: texts,
        //textangle: 90,
      };
    });
    console.log("chartData", data);
    return data;
  }, [relevantPerformanceData, currentRankFilter.maxRank]);

  const mobileLegend: Partial<Legend> = {
    orientation: "h",
    y: 10,
    valign: "top",
  };

  const desktopLegend: Partial<Legend> = {
    orientation: "v",
  };

  const isDesktopOrLaptop = useMediaQuery({
    query: "(min-width: 1024px)",
  });

  const setIsLog = (value: boolean): Promise<void> => {
    return navigate({
      search: (prev) => ({ ...prev, logAxis: value }),
    });
  };

  const allTimeRanksChart = (
    <Plot
      className="w-full"
      data={chartData}
      layout={{
        //title: "Ranks over time",
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        // remove margin reserved for title area
        margin: {
          l: 50,
          r: 50,
          b: 100,
          t: 50,
          //pad: 4,
        },

        height: 600,
        font: {
          size: 10,
          color: "darkgray",
        },
        legend: isDesktopOrLaptop ? desktopLegend : mobileLegend,
        xaxis: {
          showline: true,
          linecolor: "darkgray",
          tickangle: -45,
          type: "category",
        },
        yaxis: {
          type: isLog ? "log" : "linear",
          tick0: 0,
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
  );
  const top_n_AgentSelectionComponent = (
    <ToggleGroup
      className="items-start justify-start"
      type={`single`}
      value={rankFilter}
      onValueChange={(value: RankFilterId) => {
        navigate({
          search: (current) => ({
            ...current,
            rankFilter: value,
          }),
        });
      }}
    >
      {Array.from(rankFilters.entries()).map(([filterId, filter]) => (
        <ToggleGroupItem key={filter.name} value={filterId}>
          {filter.name}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
  const last_n_ResetsSelectionComponent = (
    <ToggleGroup
      className="items-start justify-start"
      type={`single`}
      value={resetFilter}
      onValueChange={(value: ResetFilterId) => {
        navigate({
          search: (current) => ({
            ...current,
            resetFilter: value,
          }),
        });
      }}
    >
      {Array.from(resetFilters.entries()).map(([filterId, filter]) => (
        <ToggleGroupItem key={filterId} value={filterId}>
          {filter.name}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );

  const durationSelection = (
    <div className="flex flex-col gap-2 place-items-start">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Agent Selection</CardTitle>
          <CardDescription>Chart uses max 10 entries</CardDescription>
        </CardHeader>
        <CardContent>{top_n_AgentSelectionComponent}</CardContent>
      </Card>
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Reset Selection</CardTitle>
          <CardDescription>Only finalized resets are considered</CardDescription>
        </CardHeader>
        <CardContent>{last_n_ResetsSelectionComponent}</CardContent>
      </Card>
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Chart Config</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2 text-sm">
            <Switch id="log-y-axis" checked={isLog} onCheckedChange={setIsLog} />
            <Label htmlFor="log-y-axis">Use Log For Y-Axis</Label>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  function mobileLayout(): JSX.Element {
    return (
      <Sheet>
        <div className="sub-header flex flex-row gap-2 mt-4 items-center">
          <h2 className="text-2xl font-bold">All Time Comparison</h2>
          <SheetTrigger asChild className={`block lg:hidden mr-2`}>
            <HamburgerMenuIcon className="ml-auto" />
          </SheetTrigger>
          {
            <SheetContent side="left" className="w-11/12 md:w-fit flex flex-col gap-4">
              <SheetHeader className="space-y-1">
                <SheetTitle className="text-sm font-medium leading-none">Top-N and Reset Selection</SheetTitle>
              </SheetHeader>
              {durationSelection}
              <div className="flex items-center space-x-2 text-sm">
                <Switch id="log-y-axis" checked={isLog} onCheckedChange={setIsLog} />
                <Label htmlFor="log-y-axis">Use Log For Y-Axis</Label>
              </div>
            </SheetContent>
          }
        </div>
        <div className="content p-2 flex flex-row gap-4">
          <div className="h-fit w-full">
            <div className="content">
              <div className="flex flex-col gap-2">
                <Card className="w-full">
                  <CardHeader>
                    <CardTitle>Selection</CardTitle>
                    <CardDescription></CardDescription>
                  </CardHeader>
                  {periodCardDisplay}
                </Card>
                {prettyTable(allTimePerformanceTable)}
              </div>
              <div className="flex flex-col gap-4 md:flex-row w-full">
                <div className="flex flex-col gap-2 w-full">{allTimeRanksChart}</div>
              </div>
            </div>
          </div>
        </div>
      </Sheet>
    );
  }

  function desktopLayout(): JSX.Element {
    return (
      <>
        <div className="sub-header mt-4 items-center">
          <h2 className="text-2xl font-bold">All Time Comparison</h2>
        </div>
        <div className="left flex flex-col gap-4">
          {durationSelection}
          <div className="flex flex-col gap-2">{prettyTable(allTimePerformanceTable)}</div>
        </div>
        <div className="content flex flex-col gap-4">
          <Card className="flex flex-col gap-4 p-4 w-full h-full">
            <h2 className="text-xl font-bold">
              Performance of {currentRankFilter.name} agents over {currentResetFilter.name} resets
            </h2>
            {allTimeRanksChart}
            {currentRankFilter.maxRank ? (
              <></>
            ) : (
              <p className="text-sm text-muted-foreground">Displaying only Top 10 Agents to keep chart readable.</p>
            )}
          </Card>
          <div className="flex flex-col gap-4 p-4">
            <h2 className="text-2xl font-bold">Construction Leaderboards</h2>
            <p>
              The following tables contain the same columns in different arrangements to showcase different durations
              with the relevant rank filter applied.
            </p>

            <Card className="flex flex-col gap-4 p-4 w-full h-full">
              <CardHeader>
                <CardTitle>Construction Duration</CardTitle>
                <CardDescription>Duration from first to last delivery.</CardDescription>
              </CardHeader>
              <CardContent>{prettyTable(allTimeConstructionDurationTable)}</CardContent>
            </Card>
            <Card className="flex flex-col gap-4 p-4">
              <CardHeader>
                <CardTitle>Duration Start Fortnight - Start Construction</CardTitle>
                <CardDescription>Duration from start of the fortnight to first delivery.</CardDescription>
              </CardHeader>
              <CardContent>{prettyTable(allTimeConstructionStartFortnightStartConstructionTable)}</CardContent>
            </Card>
            <Card className="flex flex-col gap-4 p-4">
              <CardHeader>
                <CardTitle>Duration Start Fortnight - Finish Construction</CardTitle>
                <CardDescription>Duration from start of the fortnight to last delivery.</CardDescription>
              </CardHeader>
              <CardContent>{prettyTable(allTimeConstructionStartFortnightFinishConstructionTable)}</CardContent>
            </Card>
          </div>
        </div>
      </>
    );
  }

  const periodCardDisplay = (
    <CardContent>
      <div className="grid grid-cols-2 w-fit gap-4">
        {renderKvPair("Agents", currentRankFilter.name)}
        {renderKvPair("Resets", currentResetFilter.name)}
      </div>
    </CardContent>
  );

  return isDesktopOrLaptop ? desktopLayout() : mobileLayout();
}
