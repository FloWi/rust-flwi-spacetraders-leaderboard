import {UiLeaderboardEntry} from "../lib/leaderboard-helper.ts";
import {GetJumpGateMostRecentProgressForResetResponseContent} from "../../generated";
import {Table} from "@tanstack/react-table";
import {ReactNode} from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../@/components/ui/sheet.tsx";
import {HamburgerMenuIcon} from "@radix-ui/react-icons";
import {Switch} from "../@/components/ui/switch.tsx";
import {Label} from "../@/components/ui/label.tsx";
import {ScrollArea} from "../@/components/ui/scroll-area.tsx";
import {prettyTable} from "./prettyTable.tsx";
import {Button} from "../@/components/ui/button.tsx";

type SheetPageProps = {
  isLog: boolean;
  setIsLog: (value: ((prevState: boolean) => boolean) | boolean) => void;
  selectedAgents: string[];
  setSelectedAgents: (newSelection: string[]) => void;
  memoizedLeaderboard: {
    sortedAndColoredLeaderboard: UiLeaderboardEntry[];
  };
  jumpGateMostRecentConstructionProgress: GetJumpGateMostRecentProgressForResetResponseContent;
  table: Table<UiLeaderboardEntry>;
  children: ReactNode;
};

export function AgentSelectionSheetPage({
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

  let jumpGatesUnderConstruction = jumpGateMostRecentConstructionProgress.progressEntries
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

  return (
    <div className="flex flex-col gap-4 w-full">
      <Sheet>
        <div className="flex flex-row gap-2 mt-4">
          <SheetTrigger asChild>
            <HamburgerMenuIcon/>
          </SheetTrigger>
          <div className="flex items-center space-x-2 text-sm">
            <Switch id="log-y-axis" checked={isLog} onCheckedChange={setIsLog}/>
            <Label htmlFor="log-y-axis">Use Log For Y-Axis</Label>
          </div>
        </div>
        <SheetContent side="left" className="w-11/12 h-5/6 md:w-fit flex flex-col gap-4">
          <SheetHeader className="space-y-1">
            <SheetTitle className="text-sm font-medium leading-none">Agent Selection</SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground">
              {selectedAgents.length} of {memoizedLeaderboard.sortedAndColoredLeaderboard.length} selected
            </SheetDescription>
          </SheetHeader>
          <ScrollArea>
            <div className="flex flex-col gap-2 mt-2">{prettyTable(table)}</div>
          </ScrollArea>
          <SheetFooter>
            <Button variant="outline" size="sm" onClick={selectTop10}>
              Top 10
            </Button>
            <Button variant="outline" size="sm" onClick={selectBuilders}>
              Builders
            </Button>
            <Button variant="outline" size="sm" onClick={clearSelection}>
              Clear
            </Button>
          </SheetFooter>
        </SheetContent>
        {children}
      </Sheet>
    </div>
  );
}
