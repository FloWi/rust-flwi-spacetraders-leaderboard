import {createFileRoute, Link, Outlet} from '@tanstack/react-router'

import {CrateService, OpenAPI} from "../../../generated";

OpenAPI.BASE = 'http://localhost:8080'

export const Route = createFileRoute('/resets')({
  component: ResetRouteComponent,
  loader: CrateService.getResetDates,

});

function ResetRouteComponent() {
  const resetDates = Route.useLoaderData();

  return (
    <>
      <div className="p-2 flex flex-row gap-6">
        <div className="text-amber-700">
          <h2>Resets</h2>

          <nav>
            <ul>
              {resetDates.resetDates.toSorted().toReversed().map((date, idx) =>
                <li key={idx}>
                  <Link to="/resets/$resetDate/leaderboard"
                        params={{resetDate: date}}
                        // search={{agents: ["WHYANDO", "SG-1-DEVX56"]}}
                        className="[&.active]:font-bold">
                    {date}
                  </Link>
                </li>)
              }

            </ul>
          </nav>
        </div>

        <Outlet/>
      </div>

    </>
  )
}
