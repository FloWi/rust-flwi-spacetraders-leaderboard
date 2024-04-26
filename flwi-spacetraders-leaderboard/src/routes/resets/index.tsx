import {createFileRoute, Link, Outlet} from "@tanstack/react-router";

import {CrateService, OpenAPI} from "../../../generated";
import {queryOptions} from "@tanstack/react-query";

OpenAPI.BASE = "http://localhost:8080";

const resetQueryOptions = queryOptions({
  queryKey: ["resetDates"],
  queryFn: () => CrateService.getResetDates().then((r) => r.resetDates),
});

export const Route = createFileRoute("/resets/")({
  component: ResetRouteComponent,
  loader: async ({
                   //deps: { agents },
                   context: {queryClient},
                 }) => {
    return queryClient.ensureQueryData(resetQueryOptions);
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
                      params={{resetDate: date}}
                      // search={{agents: ["WHYANDO", "SG-1-DEVX56"]}}
                      className="[&.active]:font-bold"
                    >
                      {date}
                    </Link>
                  </li>
                ))}
            </ul>
          </nav>
        </div>

        <Outlet/>
      </div>
    </>
  );
}
