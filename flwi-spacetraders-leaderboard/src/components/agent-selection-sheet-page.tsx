import { UiLeaderboardEntry } from "../lib/leaderboard-helper.ts";
import { ApiConstructionMaterialMostRecentProgressEntry } from "../../generated";
import { Table } from "@tanstack/react-table";
import React, { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../@/components/ui/sheet.tsx";
import { HamburgerMenuIcon } from "@radix-ui/react-icons";
import { Switch } from "../@/components/ui/switch.tsx";
import { Label } from "../@/components/ui/label.tsx";
import { ScrollArea } from "../@/components/ui/scroll-area.tsx";
import { prettyTable } from "./prettyTable.tsx";
import { Button } from "../@/components/ui/button.tsx";

type SheetPageProps = {
  title: string;
  isLog: boolean;
  setIsLog: (value: ((prevState: boolean) => boolean) | boolean) => void;
  selectedAgents: string[];
  setSelectedAgents: (newSelection: string[]) => void;
  memoizedLeaderboard: {
    sortedAndColoredLeaderboard: UiLeaderboardEntry[];
  };

  jumpGateMostRecentConstructionProgress: Array<ApiConstructionMaterialMostRecentProgressEntry>;
  table: Table<UiLeaderboardEntry>;
  children: ReactNode;
};

export function AgentSelectionSheetPage({
  title,
  isLog,
  memoizedLeaderboard,
  jumpGateMostRecentConstructionProgress,
  selectedAgents,
  setIsLog,
  setSelectedAgents,
  table,
  children,
}: SheetPageProps) {
  let top10Agents = memoizedLeaderboard.sortedAndColoredLeaderboard.slice(0, 10).map((e) => e.agentSymbol);

  let jumpGatesUnderConstruction = jumpGateMostRecentConstructionProgress
    .filter((cpe) => cpe.fulfilled > 0 && cpe.required > 1)
    .map((cpe) => cpe.jumpGateWaypointSymbol);
  let buildingAgents = memoizedLeaderboard.sortedAndColoredLeaderboard
    .filter((e) => jumpGatesUnderConstruction.includes(e.jumpGateWaypointSymbol))
    .map((e) => e.agentSymbol);

  let selectTop10: () => void = () => {
    setSelectedAgents(top10Agents);
  };
  let selectBuilders: () => void = () => {
    setSelectedAgents(buildingAgents);
  };
  let clearSelection: () => void = () => {
    setSelectedAgents([]);
  };

  let preselectionButtons = (
    <div className="flex flex-row gap-2 w-full items-stretch">
      <Button variant="outline" size="sm" onClick={selectTop10}>
        Top 10
      </Button>
      <Button variant="outline" size="sm" onClick={selectBuilders}>
        Builders
      </Button>
      <Button variant="outline" size="sm" onClick={clearSelection}>
        Clear
      </Button>
    </div>
  );

  // things get hidden based on the viewport-width.
  // Mobile view shows the hamburger-menu and the lg-view shows the side panel all the time
  // TODO: DRY up this view to make it clear what is being shown when

  return (
    <div className="flex flex-col gap-4 lg:w-full">
      <Sheet>
        <div className="flex flex-row gap-2 mt-4">
          <h2 className="text-2xl font-bold">{title}</h2>
          <SheetTrigger asChild className={`block lg:hidden mr-2`}>
            <HamburgerMenuIcon />
          </SheetTrigger>
        </div>
        <SheetContent side="left" className="w-11/12 h-5/6 lg:w-fit flex flex-col gap-4">
          <SheetHeader className="space-y-1">
            <SheetTitle className="text-sm font-medium leading-none">Agent Selection</SheetTitle>
            <SheetDescription>
              <div className="text-sm text-muted-foreground">
                {selectedAgents.length} of {memoizedLeaderboard.sortedAndColoredLeaderboard.length} selected
              </div>
            </SheetDescription>
          </SheetHeader>
          <ScrollArea>
            <div className="flex flex-col gap-4 mt-2 p-2">
              <div className="flex items-center space-x-2 text-sm">
                <Switch id="log-y-axis" checked={isLog} onCheckedChange={setIsLog} />
                <Label htmlFor="log-y-axis">Log y-axis</Label>
              </div>
              {preselectionButtons}
              {prettyTable(table)}
            </div>
          </ScrollArea>
          <SheetFooter>{preselectionButtons}</SheetFooter>
        </SheetContent>
        <div className="flex flex-row gap-4">
          <div className="hidden lg:flex flex-col gap-2 mt-2">
            <div className="text-sm font-medium leading-none">Agent Selection</div>
            <div className="text-sm text-muted-foreground">
              {selectedAgents.length} of {memoizedLeaderboard.sortedAndColoredLeaderboard.length} agents selected
            </div>
            <ScrollArea className="lg:h-5/6">
              <div className="flex flex-col gap-2 mt-2 h-fit">
                <div className="flex items-center space-x-2 text-sm">
                  <Switch id="log-y-axis" checked={isLog} onCheckedChange={setIsLog} />
                  <Label htmlFor="log-y-axis">Log y-axis</Label>
                </div>
                {preselectionButtons}
                {prettyTable(table)}
                {preselectionButtons}
              </div>
            </ScrollArea>
          </div>
          <div className="h-fit overflow-y-auto">{children}</div>
        </div>
      </Sheet>
    </div>
  );
}
