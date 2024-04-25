import {
  createRootRouteWithContext,
  Link,
  Outlet,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { QueryClient } from "@tanstack/react-query";
import { ShadcnIcons } from "../components/shadcn-icons.tsx";
import { SwaggerIcon } from "../components/swagger-icon.tsx";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "../@/components/ui/navigation-menu.tsx";
import React from "react";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    component: () => (
      <>
        <div>
          <div className="p-2 flex gap-2 items-center">
            <NavigationMenu>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuTrigger>
                    <ShadcnIcons.hamburger />
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="flex flex-col gap-4 p-6 md:w-[400px] lg:w-[500px] lg:grid-cols-[.75fr_1fr]">
                      <li>
                        <NavigationMenuLink
                          className={navigationMenuTriggerStyle()}
                        >
                          <Link to="/" className="text-xl">
                            Flwi SpaceTraders Leaderboard
                          </Link>
                        </NavigationMenuLink>
                      </li>
                      <li>
                        <Link to="/resets">
                          <NavigationMenuLink
                            className={navigationMenuTriggerStyle()}
                          >
                            Resets
                          </NavigationMenuLink>
                        </Link>
                      </li>
                      <li>
                        <Link to="/all-time">
                          <NavigationMenuLink
                            className={navigationMenuTriggerStyle()}
                          >
                            All Time Comparison
                          </NavigationMenuLink>
                        </Link>
                      </li>

                      <li></li>
                      <li></li>
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>
                <NavigationMenuIndicator />
              </NavigationMenuList>
            </NavigationMenu>
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
              <ShadcnIcons.gitHub className="mr-2 h-6 w-6" />
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
