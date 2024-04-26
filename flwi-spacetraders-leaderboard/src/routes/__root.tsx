import {
  createRootRouteWithContext,
  Link,
  Outlet,
} from "@tanstack/react-router";
import {TanStackRouterDevtools} from "@tanstack/router-devtools";
import {QueryClient} from "@tanstack/react-query";
import {ShadcnIcons} from "../components/shadcn-icons.tsx";
import {SwaggerIcon} from "../components/swagger-icon.tsx";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    component: () => (
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
                <ShadcnIcons.gitHub className="mr-2 h-6 w-6"/>
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
    ),
  },
);

// active
// flex h-7 items-center justify-center rounded-full px-4 text-center text-sm transition-colors hover:text-primary bg-muted font-medium text-primary
//inactive
// flex h-7 items-center justify-center rounded-full px-4 text-center text-sm transition-colors hover:text-primary text-muted-foreground
