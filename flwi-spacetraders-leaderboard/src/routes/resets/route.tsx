import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

import { CrateService, OpenAPI } from "../../../generated";
import { cn, useFetchState } from "../../lib/utils.ts";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
  NavigationMenuViewport,
} from "../../@/components/ui/navigation-menu";

import * as RadixNavigationMenu from "@radix-ui/react-navigation-menu";
import { ShadcnIcons } from "../../components/shadcn-icons.tsx";
import React from "react";

OpenAPI.BASE = "http://localhost:8080";

export const Route = createFileRoute("/resets")({
  component: ResetRouteComponent,
  loader: async () => {
    const current = useFetchState.getState();

    await current.refreshResetDatesIfNecessary(() =>
      //Promises are eager
      CrateService.getResetDates().then((r) => r.resetDates),
    );

    return useFetchState.getState().resetDates;
  },
});

function ResetRouteComponent() {
  const resetDates = Route.useLoaderData();

  return (
    <>
      <Outlet />
    </>
  );
}
