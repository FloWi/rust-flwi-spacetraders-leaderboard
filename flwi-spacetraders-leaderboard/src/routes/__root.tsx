import {
  createRootRouteWithContext,
  Link,
  Outlet,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { QueryClient } from "@tanstack/react-query";
import { ShadcnIcons } from "../components/shadcn-icons.tsx";
import { SwaggerIcon } from "../components/swagger-icon.tsx";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    component: () => (
      <>
        <div>
          <div className="p-2 flex gap-2 items-end">
            <Link to="/" className="text-2xl font-bold">
              Flwi SpaceTraders Leaderboard
            </Link>
            <Link to="/resets" className="[&.active]:font-bold">
              Resets
            </Link>
            <Link to="/all-time" className="[&.active]:font-bold">
              All Time Comparison
            </Link>
            <a
              className="ml-auto"
              href="/docs/swagger-ui"
              title="Swagger API docs"
              target="_blank"
            >
              <SwaggerIcon.icon
                className="mr-2 h-8 w-8"
                title="Swagger API docs"
              />
            </a>
            <a
              href="https://github.com/FloWi/rust-flwi-spacetraders-leaderboard"
              title="Github Repository"
              target="_blank"
            >
              <ShadcnIcons.gitHub className="mr-2 h-8 w-8" />
            </a>
          </div>
          <hr />
          <Outlet />
        </div>
        <TanStackRouterDevtools />
      </>
    ),
  },
);
