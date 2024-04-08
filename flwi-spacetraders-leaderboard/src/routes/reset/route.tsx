import {createFileRoute, Link, Outlet} from '@tanstack/react-router'
import {CrateService} from "../../../generated-src";

export const Route = createFileRoute('/reset')({
  component: ResetRouteComponent,
  loader: CrateService.getResetDates,

});

function ResetRouteComponent() {
  const resetDates = Route.useLoaderData();
  let latestReset = resetDates.reset_dates.toSorted().toReversed().at(0);

  return (
    <>
      <div className="p-2 flex flex-row gap-6">
        <div className="bg-blue-600 text-blue-200">
          <h2>Resets</h2>

          <nav>
            <ul>
              {latestReset != undefined &&
                <Link to="/reset/leaderboard"
                      params={{resetDate: "latest"}}
                      className="[&.active]:font-bold">
                  Latest Reset
                </Link>}

            </ul>
          </nav>
        </div>

        <Outlet/>
      </div>

    </>
  )
}
