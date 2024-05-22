import {UiLeaderboardEntry} from "../lib/leaderboard-helper.ts";
import {ApiConstructionMaterialMostRecentProgressEntry} from "../../generated";
import {Table} from "@tanstack/react-table";
import {JSX, ReactNode} from "react";
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
import {useMediaQuery} from "react-responsive";

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

  let sheetContent = (
    <SheetContent side="left" className="w-11/12 h-5/6 lg:w-fit flex flex-col gap-4">
      <SheetHeader className="space-y-1">
        <SheetTitle className="text-sm font-medium leading-none">Agent Selection</SheetTitle>
        <SheetDescription>
          <span className="text-sm text-muted-foreground">
            {selectedAgents.length} of {memoizedLeaderboard.sortedAndColoredLeaderboard.length} selected
          </span>
        </SheetDescription>
      </SheetHeader>
      <ScrollArea>
        <div className="flex flex-col gap-4 mt-2 p-2">
          {preselectionButtons}
          <div className="flex items-center space-x-2 text-sm">
            <Switch id="log-y-axis" checked={isLog} onCheckedChange={setIsLog}/>
            <Label htmlFor="log-y-axis">Log y-axis</Label>
          </div>
          {prettyTable(table)}
        </div>
      </ScrollArea>
      <SheetFooter>{preselectionButtons}</SheetFooter>
    </SheetContent>
  );

  const isDesktopOrLaptop = useMediaQuery({
    query: "(min-width: 1024px)",
  });

  //const isTabletOrMobile = useMediaQuery({ query: "(max-width: 1024px)" });

  function mobileLayout(): JSX.Element {
    return (
      <Sheet>
        <div className="sub-header flex flex-row gap-2 mt-4 items-center">
          <h2 className="text-2xl font-bold">{title}</h2>
          <SheetTrigger asChild className={`block lg:hidden mr-2`}>
            <HamburgerMenuIcon className="ml-auto"/>
          </SheetTrigger>
          {sheetContent}
        </div>
        <div className="content p-2 flex flex-row gap-4">
          <div className="h-fit w-full">{children}</div>
        </div>
      </Sheet>
    );
  }

  function desktopLayout(): JSX.Element {
    return (
      <>
        <div className="sub-header flex flex-row gap-2">
          <h2 className="text-2xl font-bold">{title}</h2>
        </div>
        <div className="left flex flex-col gap-4">
          <div className="flex flex-row gap-1">
            {preselectionButtons}
            <div className="mr-auto flex items-center space-x-2 text-sm">
              <Switch id="log-y-axis" checked={isLog} onCheckedChange={setIsLog}/>
              <Label htmlFor="log-y-axis">Log Axis</Label>
            </div>
          </div>

          {prettyTable(table)}
        </div>
        <div className="content p-4">{children}</div>
      </>
    );
  }

  return isDesktopOrLaptop ? desktopLayout() : mobileLayout();
}
