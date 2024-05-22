import {createFileRoute, useNavigate} from "@tanstack/react-router";
import React, {JSX, useMemo} from "react";
import {ApiAllTimeRankEntry, mockDataAllTime} from "../../lib/all-time-testdata.ts";
import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {intNumberFmt, prettyDuration} from "../../lib/formatters.ts";
import {ToggleGroup, ToggleGroupItem} from "../../@/components/ui/toggle-group.tsx";
import {prettyTable} from "../../components/prettyTable.tsx";
import Plot from "react-plotly.js";
import {Legend, PlotType} from "plotly.js";
import {Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger} from "../../@/components/ui/sheet.tsx";
import {HamburgerMenuIcon} from "@radix-ui/react-icons";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "../../@/components/ui/card.tsx";
import {renderKvPair} from "../../lib/key-value-card-helper.tsx";
import {useMediaQuery} from "react-responsive";
import {Switch} from "../../@/components/ui/switch.tsx";
import {Label} from "../../@/components/ui/label.tsx";
import {useQuery} from "@tanstack/react-query";
import {resetDatesQueryOptions} from "../../utils/queryOptions.ts";
import {ApiResetDateMeta} from "../../../generated";

type RankFilter = { name: string; maxRank?: number };
type ResetFilter = { name: string; numberResets?: number };
type RankFilterId = "top1" | "top3" | "top5" | "top10" | "all";

let rankFilters: Map<RankFilterId, RankFilter> = new Map([
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
};

export const Route = createFileRoute("/all-time/")({
  component: AllTimeComponent,
  loader: async ({context: {queryClient}}) => {
    await queryClient.prefetchQuery(resetDatesQueryOptions);
  },
  pendingComponent: () => <div>Loading...</div>,
  validateSearch: (search: Record<string, unknown>): AllTimeSelectionSearch => {
    let resetFilterStr = search?.resetFilter as string;
    let rankFilterStr = search?.rankFilter as string;

    return {
      resetFilter: resetFilters.has(resetFilterStr as ResetFilterId) ? (resetFilterStr as ResetFilterId) : "last5",
      rankFilter: rankFilters.has(rankFilterStr as RankFilterId) ? (rankFilterStr as RankFilterId) : "top5",
    };
  },
});

interface AllTimeRankEntry extends ApiAllTimeRankEntry {
  resetDate: ApiResetDateMeta;
}

const columnHelperAllTimeData = createColumnHelper<AllTimeRankEntry>();

const allTimeColumns = [
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
  let {data: allResetDates} = useQuery(resetDatesQueryOptions);

  let {rankFilter, resetFilter} = Route.useSearch();

  const navigate = useNavigate({from: Route.fullPath});

  let {currentRankFilter, currentResetFilter} = React.useMemo(() => {
    return {currentRankFilter: rankFilters.get(rankFilter)!, currentResetFilter: resetFilters.get(resetFilter)!};
  }, [rankFilter, resetFilter]);

  let {allTimeData, resetDates} = useMemo(() => {
    let resetDates = Array.from(new Set(mockDataAllTime.map((d) => d.reset)))
      .toSorted()
      .toReversed();
    return {allTimeData: mockDataAllTime, resetDates};
  }, []);

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [isLog, setIsLog] = React.useState(true);

  let relevantData: AllTimeRankEntry[] = useMemo(() => {
    let relevantResetDates = new Set(
      currentResetFilter.numberResets ? resetDates.slice(0, currentResetFilter.numberResets) : resetDates,
    );
    return allTimeData
      .filter((d) => {
        return (
          (currentRankFilter.maxRank ? d.rank <= currentRankFilter.maxRank : true) && relevantResetDates.has(d.reset)
        );
      })
      .flatMap((d) => {
        let resetMeta = allResetDates?.find((rd) => rd.resetDate === d.reset);
        return resetMeta ? [{...d, resetDate: resetMeta, reset: resetMeta.resetDate}] : [];
      });
  }, [currentRankFilter, currentResetFilter]);

  const table = useReactTable({
    defaultColumn: {
      size: 25,
    },
    data: relevantData,
    enableRowSelection: false,
    columns: allTimeColumns,
    //getRowId: (row) => `${row}-${row.tradeSymbol}`,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {sorting},
    onSortingChange: setSorting,
    debugTable: true,
  });

  const chartData = React.useMemo(() => {
    let maxRank = currentRankFilter.maxRank ?? 10;
    let resets = Array.from(new Set(relevantData.map((d) => d.reset))).toSorted();
    let ranks = Array.from(Array(maxRank).keys()).map((r) => r + 1);

    let data = ranks.map((rank) => {
      let rankData = resets.flatMap((r) => relevantData.filter((d) => d.reset === r && d.rank === rank));
      let yValues = rankData.map((d) => d.credits);
      let texts = rankData.map((d) => d.agentSymbol);

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
  }, [relevantData]);

  let mobileLegend: Partial<Legend> = {
    orientation: "h",
    y: 10,
    valign: "top",
  };

  let desktopLegend: Partial<Legend> = {
    orientation: "v",
  };

  const isDesktopOrLaptop = useMediaQuery({
    query: "(min-width: 1024px)",
  });

  let allTimeRanksChart = (
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
      config={{displayModeBar: false, responsive: true}}
    />
  );
  let top_n_AgentSelectionComponent = (
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
  let last_n_ResetsSelectionComponent = (
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

  let durationSelection = (
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
            <Switch id="log-y-axis" checked={isLog} onCheckedChange={setIsLog}/>
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
          <h2 className="text-2xl font-bold">All Time comparison</h2>
          <SheetTrigger asChild className={`block lg:hidden mr-2`}>
            <HamburgerMenuIcon className="ml-auto"/>
          </SheetTrigger>
          {
            <SheetContent side="left" className="w-11/12 md:w-fit flex flex-col gap-4">
              <SheetHeader className="space-y-1">
                <SheetTitle className="text-sm font-medium leading-none">Top-N and Reset Selection</SheetTitle>
              </SheetHeader>
              {durationSelection}
              <div className="flex items-center space-x-2 text-sm">
                <Switch id="log-y-axis" checked={isLog} onCheckedChange={setIsLog}/>
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
                {prettyTable(table)}
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
          <h2 className="text-2xl font-bold">All Time comparison</h2>
        </div>
        <div className="left flex flex-col gap-4">
          {durationSelection}
          <div className="flex flex-col gap-2">{prettyTable(table)}</div>
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
        </div>
      </>
    );
  }

  let periodCardDisplay = (
    <CardContent>
      <div className="grid grid-cols-2 w-fit gap-4">
        {renderKvPair("Agents", currentRankFilter.name)}
        {renderKvPair("Resets", currentResetFilter.name)}
      </div>
    </CardContent>
  );

  return isDesktopOrLaptop ? desktopLayout() : mobileLayout();
}
