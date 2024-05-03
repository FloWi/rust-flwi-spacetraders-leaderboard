import {
  Link,
  LinkProps,
  RegisteredRouter,
  RouterState,
  useMatch,
} from "@tanstack/react-router";
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
  const deepestMatch = routerState.matches.at(-1);

  console.log("routerState", routerState);

  let resetLinks: ResetLink[] = [];
  let current:
    | { currentResetDate: string; selectedAgents?: string[] }
    | undefined;

  if (deepestMatch?.routeId == "/resets/$resetDate/leaderboard") {
    current = useMatch({
      from: "/resets/$resetDate/leaderboard",
      select: (m) => {
        return {
          currentResetDate: m.params.resetDate,
          selectedAgents: m.search.agents,
        };
      },
    });

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
    current = useMatch({
      from: "/resets/$resetDate/history",
      select: (m) => {
        return {
          currentResetDate: m.params.resetDate,
          selectedAgents: m.search.selectedAgents,
        };
      },
    });

    resetLinks = resetDates.map((r) => {
      return {
        resetDate: r,
        props: (
          <Link
            to="/resets/$resetDate/history"
            params={{resetDate: r}}
            search={{selectedAgents: current?.selectedAgents}}
            className="[&.active]:font-bold"
          >
            {r}
          </Link>
        ).props,
      };
    });
  } else if (deepestMatch?.routeId == "/resets/$resetDate/jump-gate") {
    current = useMatch({
      from: "/resets/$resetDate/jump-gate",
      select: (m) => {
        return {
          currentResetDate: m.params.resetDate,
          selectedAgents: undefined,
        };
      },
    });

    resetLinks = resetDates.map((r) => {
      return {
        resetDate: r,
        props: (
          <Link
            to="/resets/$resetDate/jump-gate"
            params={{resetDate: r}}
            className="[&.active]:font-bold"
          >
            Hello jump-gate overview for Reset {r}
          </Link>
        ).props,
      };
    });
  }

  let sortedEntries = _.sortBy(resetLinks, ({resetDate}) => resetDate);
  if (current?.currentResetDate) {
    let currentResetIdx = sortedEntries.findIndex(
      ({resetDate}) => resetDate == current?.currentResetDate,
    );
    if (currentResetIdx >= 0) {
      let previousIndex =
        currentResetIdx >= 1 ? currentResetIdx - 1 : undefined;
      let nextIndex =
        currentResetIdx < sortedEntries.length - 1
          ? currentResetIdx + 1
          : undefined;
      return {
        allResets: sortedEntries,
        currentlySelectedResetDate: current?.currentResetDate,
        nextReset: nextIndex ? sortedEntries.at(nextIndex) : undefined,
        previousReset: previousIndex
          ? sortedEntries.at(previousIndex)
          : undefined,
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
    let {
      allResets,
      currentlySelectedResetDate,
      nextReset,
      previousReset,
      latestReset,
    } = res;

    let directNavigationLinks = intersperse(
      [
        previousReset ? (
          <MyLink {...previousReset.props}>Previous Reset</MyLink>
        ) : null,
        nextReset ? <MyLink {...nextReset.props}>Next Reset</MyLink> : null,
        latestReset ? (
          <MyLink {...latestReset.props}>Latest Reset</MyLink>
        ) : null,
      ],
      (idx) => <Separator orientation="vertical" key={`separator_${idx}`}/>,
    );
    return (
      <>
        <NavigationMenuItem>
          <NavigationMenuTrigger>
            <div className="space-y-1 text-left">
              <h4 className="text-sm font-medium leading-none">Reset</h4>
              <p className="text-sm text-muted-foreground">
                {currentlySelectedResetDate}
              </p>
            </div>
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="flex flex-col w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px] ">
              <li className="flex flex-row gap-4">{directNavigationLinks}</li>
              {allResets.toReversed().map(({resetDate, props}) => {
                return (
                  <li>
                    <MyLink key={`other-reset-${resetDate}`} {...props} />
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
