import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

import { OpenAPI } from "../../../generated";
import { resetDatesQueryOptions } from "../../utils/queryOptions.ts";

OpenAPI.BASE = "http://localhost:8080";

export const Route = createFileRoute("/resets/")({
  component: ResetRouteComponent,
  loader: async ({
    //deps: { agents },
    context: { queryClient },
  }) => {
    return queryClient.ensureQueryData(resetDatesQueryOptions);
  },
});

function ResetRouteComponent() {
  const resetDates = Route.useLoaderData();

  return (
    <>
      <div className="flex flex-row gap-6">
        <div>
          <h2>Resets</h2>
          <nav>
            <ul>
              {resetDates
                .toSorted()
                .toReversed()
                .map((date, idx) => (
                  <li key={idx}>
                    <Link
                      to="/resets/$resetDate/leaderboard"
                      params={{ resetDate: date.resetDate }}
                      // search={{agents: ["WHYANDO", "SG-1-DEVX56"]}}
                      className="[&.active]:font-bold"
                    >
                      {date.resetDate}
                    </Link>
                  </li>
                ))}
            </ul>
          </nav>
        </div>

        <Outlet />
      </div>
    </>
  );
}
