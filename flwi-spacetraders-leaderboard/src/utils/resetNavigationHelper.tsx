import {Link, LinkProps, RegisteredRouter, RouteMatch, RouterState} from "@tanstack/react-router";
import * as _ from "lodash";
import {
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuTrigger,
} from "../@/components/ui/navigation-menu.tsx";
import {MyLink} from "../components/myLink.tsx";
import {Separator} from "../@/components/ui/separator.tsx";

type ResetLink = {
  resetDate: string;
  props: LinkProps;
};

function extractPathAndSearchParams(
  match: RouteMatch<RegisteredRouter["routeTree"]>,
): { currentResetDate: string; selectedAgents?: string[] } | undefined {
  // very ugly, but YOLO
  // will replace it with zustand state manager at one point
  // haven't found a proper way to extract the params and search in a typesafe way,

  try {
    let params: any = match.params;
    let resetDate: string | undefined;
    let selectedAgents: string[] | undefined;
    if (params.resetDate) {
      resetDate = params.resetDate;
    }
    let search = match.search as any;
    if (search.selectedAgents) {
      selectedAgents = search.selectedAgents;
    }
    if (search.agents) {
      selectedAgents = search.agents;
    }
    return resetDate ? {currentResetDate: resetDate, selectedAgents: selectedAgents} : undefined;
  } catch (e) {
    console.error("error during extractPathAndSearchParams", e);
    return undefined;
  }
}

function createLinksToOtherResets(
  resetDates: string[],
  routerState: RouterState<RegisteredRouter["routeTree"]>,
):
  | {
  allResets: ResetLink[];
  currentlySelectedResetDate: string;
  nextReset?: ResetLink;
  previousReset?: ResetLink;
  latestReset?: ResetLink;
}
  | undefined {
  const deepestMatch: RouteMatch<RegisteredRouter["routeTree"]> | undefined = routerState.matches.at(-1);

  // console.log("routerState", routerState);

  let resetLinks: ResetLink[] = [];
  let current = deepestMatch ? extractPathAndSearchParams(deepestMatch) : undefined;

  if (deepestMatch?.routeId == "/resets/$resetDate/leaderboard") {
    resetLinks = resetDates.map((r) => {
      return {
        resetDate: r,
        props: (
          <Link
            to="/resets/$resetDate/leaderboard"
            params={{resetDate: r}}
            search={{agents: current?.selectedAgents}}
            className="[&.active]:font-bold"
          >
            Reset {r}
          </Link>
        ).props,
      };
    });
  } else if (deepestMatch?.routeId == "/resets/$resetDate/history") {
    resetLinks = resetDates.map((r) => {
      return {
        resetDate: r,
        props: (
          <Link
            to="/resets/$resetDate/history"
            params={{resetDate: r}}
            search={{agents: current?.selectedAgents}}
            className="[&.active]:font-bold"
          >
            {r}
          </Link>
        ).props,
      };
    });
  } else if (deepestMatch?.routeId == "/resets/$resetDate/jump-gate") {
    resetLinks = resetDates.map((r) => {
      return {
        resetDate: r,
        props: (
          <Link to="/resets/$resetDate/jump-gate" params={{resetDate: r}} className="[&.active]:font-bold">
            Hello jump-gate overview for Reset {r}
          </Link>
        ).props,
      };
    });
  }

  let sortedEntries = _.sortBy(resetLinks, ({resetDate}) => resetDate);
  if (current?.currentResetDate) {
    let currentResetIdx = sortedEntries.findIndex(({resetDate}) => resetDate == current?.currentResetDate);
    if (currentResetIdx >= 0) {
      let previousIndex = currentResetIdx >= 1 ? currentResetIdx - 1 : undefined;
      let nextIndex = currentResetIdx < sortedEntries.length - 1 ? currentResetIdx + 1 : undefined;
      return {
        allResets: sortedEntries,
        currentlySelectedResetDate: current?.currentResetDate,
        nextReset: nextIndex ? sortedEntries.at(nextIndex) : undefined,
        previousReset: previousIndex ? sortedEntries.at(previousIndex) : undefined,
        latestReset: sortedEntries.at(-1),
      };
    }
  }
}

function intersperse<T>(arr: T[], separator: (n: number) => T): T[] {
  return arr.flatMap((a, i) => (i > 0 ? [separator(i - 1), a] : [a]));
}

export function createSamePageOtherResetNavigationMenuItem(
  resetDates: string[],
  currentState: RouterState<RegisteredRouter["routeTree"]>,
): JSX.Element | undefined {
  let res = createLinksToOtherResets(resetDates, currentState);

  if (res) {
    let {allResets, currentlySelectedResetDate, nextReset, previousReset, latestReset} = res;

    let directNavigationLinks = intersperse(
      [
        previousReset ? (
          <MyLink key={"previousReset"} {...previousReset.props}>
            Previous Reset
          </MyLink>
        ) : null,
        nextReset ? (
          <MyLink key={"nextReset"} {...nextReset.props}>
            Next Reset
          </MyLink>
        ) : null,
        latestReset ? (
          <MyLink key={"latestReset"} {...latestReset.props}>
            Latest Reset
          </MyLink>
        ) : null,
      ],
      (idx) => <Separator orientation="vertical" key={`separator_${idx}`}/>,
    );
    return (
      <>
        <NavigationMenuItem>
          <NavigationMenuTrigger>
            <div className="space-y-1 text-left">
              <h4 className="text-sm font-medium leading-none">{currentlySelectedResetDate}</h4>
              {/*<h4 className="text-sm font-medium leading-none">Reset</h4>*/}
              {/*<p className="text-sm text-muted-foreground">{currentlySelectedResetDate}</p>*/}
            </div>
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="flex flex-col w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]">
              <li className="flex flex-row gap-4">{directNavigationLinks}</li>
              {allResets.toReversed().map(({resetDate, props}) => {
                return (
                  <li key={`other-reset-${resetDate}`}>
                    <MyLink {...props} />
                  </li>
                );
              })}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </>
    );
  }
}
