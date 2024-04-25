import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

import { CrateService, OpenAPI } from "../../../generated";
import { useFetchState } from "../../lib/utils.ts";

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
