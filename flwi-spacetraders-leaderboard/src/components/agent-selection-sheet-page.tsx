import {ApiConstructionMaterialMostRecentProgressEntry, ApiLeaderboardEntry} from "../../generated";
import {Table} from "@tanstack/react-table";
import {Dispatch, JSX, ReactNode} from "react";
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
  setIsLog: Dispatch<boolean>;
  selectedAgents: string[];
  setSelectedAgents: (newSelection: string[]) => void;
  memoizedLeaderboard: {
    leaderboard: ApiLeaderboardEntry[];
  };

  jumpGateMostRecentConstructionProgress: Array<ApiConstructionMaterialMostRecentProgressEntry>;
  table: Table<ApiLeaderboardEntry>;
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
  const top10Agents = memoizedLeaderboard.leaderboard.slice(0, 10).map((e) => e.agentSymbol);

  const jumpGatesUnderConstruction = jumpGateMostRecentConstructionProgress
    .filter((cpe) => cpe.fulfilled > 0 && cpe.required > 1)
    .map((cpe) => cpe.jumpGateWaypointSymbol);
  const buildingAgents = memoizedLeaderboard.leaderboard
    .filter((e) => jumpGatesUnderConstruction.includes(e.jumpGateWaypointSymbol))
    .map((e) => e.agentSymbol);

  const selectTop10: () => void = () => {
    setSelectedAgents(top10Agents);
  };
  const selectBuilders: () => void = () => {
    setSelectedAgents(buildingAgents);
  };
  const clearSelection: () => void = () => {
    setSelectedAgents([]);
  };

  const preselectionButtons = (
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

  const sheetContent = (
    <SheetContent side="left" className="w-11/12 h-5/6 lg:w-fit flex flex-col gap-4">
      <SheetHeader className="space-y-1">
        <SheetTitle className="text-sm font-medium leading-none">Agent Selection</SheetTitle>
        <SheetDescription>
          <span className="text-sm text-muted-foreground">
            {selectedAgents.length} of {memoizedLeaderboard.leaderboard.length} selected
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
        <div className="sub-header flex flex-row gap-2 mt-1 items-center">
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
