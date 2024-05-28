import {
  createRootRouteWithContext,
  LinkProps,
  Outlet,
  RegisteredRouter,
  RouteMatch,
  RouterState,
  useRouterState,
} from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { SwaggerIcon } from "../components/swagger-icon.tsx";
import { GitHubLogoIcon } from "@radix-ui/react-icons";
import { resetDatesQueryOptions } from "../utils/queryOptions.ts";
import { createSamePageOtherResetNavigationMenuItem } from "../utils/resetNavigationHelper.tsx";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "../@/components/ui/navigation-menu.tsx";
import { MyLink } from "../components/myLink.tsx";
import * as _ from "lodash";
import { Separator } from "../@/components/ui/separator.tsx";
import { useMediaQuery } from "react-responsive";
import React, { Suspense } from "react";
import { TanStackRouterDevtools } from "../components/TanStackRouterDevtools.tsx";

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    customData?: string;
    otherResetDateLinkFn?: (agentSelection: { agents: string[] }) => (arg: { resetDate: string }) => LinkProps;
  }
}

function getTitleOfCurrentResetPage(routerState: RouterState<RegisteredRouter["routeTree"]>) {
  const deepestMatch: RouteMatch<RegisteredRouter["routeTree"]> | undefined = routerState.matches.at(-1);

  // console.log("routerState", routerState);

  switch (deepestMatch?.routeId) {
    case "/resets/$resetDate/leaderboard":
      return "Leaderboard";
    case "/resets/$resetDate/history":
      return "History";
    case "/resets/$resetDate/jump-gate":
      return "JumpGate";
    default:
      return undefined;
  }
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: async ({
    //deps: { agents },
    context: { queryClient },
  }) => {
    return queryClient.ensureQueryData(resetDatesQueryOptions);
  },

  component: () => {
    const currentState = useRouterState();
    const resetDates = Route.useLoaderData();

    const titleOfCurrentResetPage: string | undefined = getTitleOfCurrentResetPage(currentState);

    const otherResetsNavMenuItem = createSamePageOtherResetNavigationMenuItem(
      resetDates.map((r) => r.resetDate),
      currentState,
    );

    const isInnerResetRoute = !!titleOfCurrentResetPage;

    let maybeLatestResetDate = _.sortBy(resetDates, (rd) => rd.resetDate)
      .toSorted()
      .at(-1);

    let currentResetLeaderboardLink = maybeLatestResetDate ? (
      <MyLink
        to="/resets/$resetDate/leaderboard"
        params={{ resetDate: maybeLatestResetDate?.resetDate }}
        className="flex h-7 items-center justify-center rounded-full px-2 text-center text-sm transition-colors hover:text-primary text-muted-foreground
              [&.active]:bg-muted
              [&.active]:font-medium
              [&.active]:text-primary
"
      >
        Latest Reset
      </MyLink>
    ) : null;

    let innerResetNavMenuItem = (
      <NavigationMenuItem>
        <NavigationMenuTrigger>{titleOfCurrentResetPage}</NavigationMenuTrigger>
        <NavigationMenuContent>
          <ul className="flex flex-col gap-4 p-6 md:w-[400px] lg:w-[500px] ">
            <li className="">
              <MyLink
                to="/resets/$resetDate/leaderboard"
                params={{
                  resetDate: maybeLatestResetDate?.resetDate,
                }}
                search={true}
                className="flex h-7 items-center justify-center rounded-full px-2 text-center text-sm transition-colors hover:text-primary text-muted-foreground
              [&.active]:bg-muted
              [&.active]:font-medium
              [&.active]:text-primary"
              >
                Leaderboard
              </MyLink>
            </li>
            <li className="">
              <MyLink
                to="/resets/$resetDate/jump-gate"
                search={true}
                className="flex h-7 items-center justify-center rounded-full px-2 text-center text-sm transition-colors hover:text-primary text-muted-foreground
              [&.active]:bg-muted
              [&.active]:font-medium
              [&.active]:text-primary
"
              >
                Jump-Gate
              </MyLink>
            </li>
            <li className="">
              <MyLink
                to="/resets/$resetDate/history"
                search={true}
                className="flex h-7 items-center justify-center rounded-full px-2 text-center text-sm transition-colors hover:text-primary text-muted-foreground
              [&.active]:bg-muted
              [&.active]:font-medium
              [&.active]:text-primary
"
              >
                History
              </MyLink>
            </li>
          </ul>
        </NavigationMenuContent>
      </NavigationMenuItem>
    );
    let headerContent = (
      <div className="flex flex-row px-1 items-center">
        <NavigationMenu>
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuTrigger>Nav</NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="flex flex-col gap-4 p-6 md:w-[400px] lg:w-[500px] ">
                  <li className="">
                    <MyLink
                      to="/"
                      params={{
                        resetDate: maybeLatestResetDate?.resetDate,
                      }}
                      className="flex h-7 items-center justify-center rounded-full px-2 text-center text-sm transition-colors hover:text-primary text-muted-foreground
              [&.active]:bg-muted
              [&.active]:font-medium
              [&.active]:text-primary"
                    >
                      Home
                    </MyLink>
                  </li>
                  <li className="">
                    <MyLink
                      to="/resets"
                      className="flex h-7 items-center justify-center rounded-full px-2 text-center text-sm transition-colors hover:text-primary text-muted-foreground
              [&.active]:bg-muted
              [&.active]:font-medium
              [&.active]:text-primary
"
                    >
                      Resets
                    </MyLink>
                  </li>
                  {currentResetLeaderboardLink ? <li>{currentResetLeaderboardLink}</li> : null}
                  <li className="">
                    <MyLink
                      to="/all-time"
                      params={{
                        resetDate: maybeLatestResetDate?.resetDate,
                      }}
                      className="flex h-7 items-center justify-center rounded-full px-2 text-center text-sm transition-colors hover:text-primary text-muted-foreground
              [&.active]:bg-muted
              [&.active]:font-medium
              [&.active]:text-primary
"
                    >
                      All Time Comparison
                    </MyLink>
                  </li>
                  <li>
                    <Separator />
                    <div className="flex flex-row gap-4 mt-4">
                      <a href="/docs/swagger-ui" title="Swagger API docs" target="_blank">
                        <SwaggerIcon.icon className="mr-2 h-6 w-6" title="Swagger API docs" />
                      </a>
                      <a
                        href="https://github.com/FloWi/rust-flwi-spacetraders-leaderboard"
                        title="Github Repository"
                        target="_blank"
                      >
                        <GitHubLogoIcon className="mr-2 h-6 w-6" />
                      </a>
                    </div>
                  </li>
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
            {otherResetsNavMenuItem}
            {isInnerResetRoute ? innerResetNavMenuItem : <></>}
          </NavigationMenuList>
        </NavigationMenu>
      </div>
    );

    const isDesktopOrLaptop = useMediaQuery({
      query: "(min-width: 1024px)",
    });

    return (
      <>
        <div className={`${isDesktopOrLaptop ? "desktop-page" : "mobile-page"} bg-background shadow-md`}>
          <div className="header">
            {headerContent}
            <Separator />
          </div>
          <Outlet />
        </div>
        <Suspense>
          <TanStackRouterDevtools />
        </Suspense>{" "}
      </>
    );
  },
});

// active
// flex h-7 items-center justify-center rounded-full px-2 text-center text-sm transition-colors hover:text-primary bg-muted font-medium text-primary
//inactive
// flex h-7 items-center justify-center rounded-full px-2 text-center text-sm transition-colors hover:text-primary text-muted-foreground
