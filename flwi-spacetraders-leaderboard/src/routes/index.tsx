import {createFileRoute, Link} from '@tanstack/react-router'
import {CrateService} from "../../generated-src";

export const Route = createFileRoute('/')({
  component: Index,
  loader: CrateService.getResetDates
})

function Index() {

  const resetDates = Route.useLoaderData();

  return (
    <div className="p-2 flex flex-col">
      <h3>Welcome Home!</h3>
      <ul>
        {resetDates.reset_dates.map((resetDate, index) => <li key={index}>
          <Link to="/reset/$resetDate" params={{resetDate: resetDate}}

          >{resetDate}</Link>

        </li>)}
      </ul>

    </div>
  )
}
