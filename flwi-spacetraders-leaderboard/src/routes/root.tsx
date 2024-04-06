import {Link, Outlet, useLoaderData} from "react-router-dom";
import {CrateService} from "../../generated-src";

export async function fetchData() {
  return CrateService.getResetDates();
}

export default function Root() {

  const resetDates = useLoaderData() as Awaited<ReturnType<typeof fetchData>>;


  return (
    <>
      <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white min-h-screen p-4 flex flex-col gap-8">
        <h1 className="text-xl font-bold">Flwi Spacetraders Leaderboard</h1>
        <div className="flex flex-row gap-4">
          <div id="sidebar">
            <h3>Reset-Dates</h3>
            <nav className="flex items-center justify-between flex-wrap bg-teal-500 p-6">
              <ul>
                <ul>
                  {resetDates.reset_dates.map((item, index) => <li key={index}>
                    <Link to={`/reset/${item}`}>{item}</Link>
                  </li>)}

                </ul>
                <li>
                </li>
              </ul>
            </nav>
          </div>
          <div id="detail">
            <Outlet/>
          </div>
        </div>
      </div>
    </>
  );
}
