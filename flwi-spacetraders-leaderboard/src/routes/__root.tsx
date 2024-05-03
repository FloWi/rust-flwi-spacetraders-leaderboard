import {
  createRootRouteWithContext,
  Link,
  LinkProps,
  Outlet,
  RegisteredRouter,
  RouterState,
  useMatch,
  useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { QueryClient } from "@tanstack/react-query";
import { SwaggerIcon } from "../components/swagger-icon.tsx";
import { GitHubLogoIcon } from "@radix-ui/react-icons";
import { resetDatesQueryOptions } from "../utils/queryOptions.ts";
import * as _ from "lodash";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "../@/components/ui/navigation-menu.tsx";
import { MyLink } from "../components/myLink.tsx";

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    customData?: string;
    otherResetDateLinkFn?: (agentSelection: {
      agents: string[];
    }) => (arg: { resetDate: string }) => LinkProps;
  }
}

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
      currentResetDate: string;
      nextReset?: ResetLink;
      previousReset?: ResetLink;
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
            params={{ resetDate: r }}
            search={{ agents: current?.selectedAgents }}
            className="[&.active]:font-bold"
          >
            Hello leaderboard for Reset {r}
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
            params={{ resetDate: r }}
            search={{ selectedAgents: current?.selectedAgents }}
            className="[&.active]:font-bold"
          >
            Hello leaderboard for Reset {r}
          </Link>
        ).props,
      };
    });
  }

  let sortedEntries = _.sortBy(resetLinks, ({ resetDate }) => resetDate);
  if (current?.currentResetDate) {
    let currentResetIdx = sortedEntries.findIndex(
      ({ resetDate }) => resetDate == current?.currentResetDate,
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
        currentResetDate: current?.currentResetDate,
        nextReset: nextIndex ? sortedEntries.at(nextIndex) : undefined,
        previousReset: previousIndex
          ? sortedEntries.at(previousIndex)
          : undefined,
      };
    }
  }
}

function createSamePageOtherResetNavigationMenu(
  resetDates: string[],
  currentState: RouterState<RegisteredRouter["routeTree"]>,
) {
  let res = createLinksToOtherResets(resetDates, currentState);

  if (res) {
    let { allResets, currentResetDate, nextReset, previousReset } = res;

    return (
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuTrigger>
              <div className="space-y-1 text-left">
                <h4 className="text-sm font-medium leading-none">Reset</h4>
                <p className="text-sm text-muted-foreground">
                  {currentResetDate}
                </p>
              </div>
            </NavigationMenuTrigger>
            <NavigationMenuContent>
              <ul className="flex flex-col w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px] ">
                {allResets.toReversed().map(({ resetDate, props }) => {
                  return (
                    <MyLink
                      key={`other-reset-${resetDate}`}
                      {...props}
                      content={`Reset ${resetDate}`}
                    />
                  );
                })}
              </ul>
            </NavigationMenuContent>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    );
  }
  return <></>;
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    loader: async ({
      //deps: { agents },
      context: { queryClient },
    }) => {
      return queryClient.ensureQueryData(resetDatesQueryOptions);
    },

    component: () => {
      const currentState = useRouterState();
      const resetDates = Route.useLoaderData();

      const navMenu = createSamePageOtherResetNavigationMenu(
        resetDates,
        currentState,
      );

      return (
        <>
          <div>
            <div className="min-w-full table p-4">
              <div className="flex flex-row items-center">
                <Link
                  to="/"
                  className="flex h-7 items-center justify-center rounded-full px-4 text-center text-sm transition-colors hover:text-primary text-muted-foreground
              [&.active]:bg-muted
              [&.active]:font-medium
              [&.active]:text-primary
"
                >
                  Home
                </Link>
                {navMenu}
                <Link
                  to="/all-time"
                  className="flex h-7 items-center justify-center rounded-full px-4 text-center text-sm transition-colors hover:text-primary text-muted-foreground
              [&.active]:bg-muted
              [&.active]:font-medium
              [&.active]:text-primary
"
                >
                  All Time Comparison
                </Link>
                <a
                  className="ml-auto"
                  href="/docs/swagger-ui"
                  title="Swagger API docs"
                  target="_blank"
                >
                  <SwaggerIcon.icon
                    className="mr-2 h-6 w-6"
                    title="Swagger API docs"
                  />
                </a>
                <a
                  href="https://github.com/FloWi/rust-flwi-spacetraders-leaderboard"
                  title="Github Repository"
                  target="_blank"
                >
                  <GitHubLogoIcon className="mr-2 h-6 w-6" />
                </a>
              </div>
            </div>
            <hr />
            <div className="p-4">
              <Outlet />
            </div>
          </div>
          <TanStackRouterDevtools />
        </>
      );
    },
  },
);

// active
// flex h-7 items-center justify-center rounded-full px-4 text-center text-sm transition-colors hover:text-primary bg-muted font-medium text-primary
//inactive
// flex h-7 items-center justify-center rounded-full px-4 text-center text-sm transition-colors hover:text-primary text-muted-foreground
