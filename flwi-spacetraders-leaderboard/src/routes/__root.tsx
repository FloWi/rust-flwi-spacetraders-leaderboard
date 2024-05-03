import {
  createRootRouteWithContext,
  Link,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import {TanStackRouterDevtools} from "@tanstack/router-devtools";
import {QueryClient} from "@tanstack/react-query";
import {SwaggerIcon} from "../components/swagger-icon.tsx";
import {GitHubLogoIcon} from "@radix-ui/react-icons";
import {resetDatesQueryOptions} from "../utils/queryOptions.ts";

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    customData?: string;
  }
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    loader: async ({
                     //deps: { agents },
                     context: {queryClient},
                   }) => {
      return queryClient.ensureQueryData(resetDatesQueryOptions);
    },

    component: () => {
      const resetDates = Route.useLoaderData();

      const currentState = useRouterState();

      const deepestMatch = currentState.matches.at(-1);
      const currentLocation = currentState.location;
      const currentAgents = currentLocation.search.agents;

      console.log("currentState", currentState);
      console.log("currentLocation", currentLocation);
      console.log("currentAgents", currentAgents);

      if (deepestMatch?.routeId == "/resets/$resetDate/leaderboard") {
        let links = resetDates.map((r) => {
          return (
            <Link
              to="/resets/$resetDate/leaderboard"
              params={{resetDate: r}}
              search={{agents: currentAgents}}
              className="[&.active]:font-bold"
            >
              Hello leaderboard for Reset {r}
            </Link>
          );
        });

        console.log(
          "Props of first link to other leaderboard",
          links.slice(0, 1).map((l) => l.props),
        );
      }

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
                <Link
                  to="/resets"
                  className="flex h-7 items-center justify-center rounded-full px-4 text-center text-sm transition-colors hover:text-primary text-muted-foreground
              [&.active]:bg-muted
              [&.active]:font-medium
              [&.active]:text-primary
"
                >
                  Resets
                </Link>
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
                  <GitHubLogoIcon className="mr-2 h-6 w-6"/>
                </a>
              </div>
            </div>
            <hr/>
            <div className="p-4">
              <Outlet/>
            </div>
          </div>
          <TanStackRouterDevtools/>
        </>
      );
    },
  },
);

// active
// flex h-7 items-center justify-center rounded-full px-4 text-center text-sm transition-colors hover:text-primary bg-muted font-medium text-primary
//inactive
// flex h-7 items-center justify-center rounded-full px-4 text-center text-sm transition-colors hover:text-primary text-muted-foreground
