import {createFileRoute, Link, Outlet} from "@tanstack/react-router";

import {OpenAPI} from "../../../generated";
import {resetDatesQueryOptions} from "../../utils/queryOptions.ts";
import {prettyDuration} from "../../lib/formatters.ts";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "../../@/components/ui/table.tsx";
import {CircleCheckBigIcon} from "lucide-react";

OpenAPI.BASE = "http://localhost:8080";

export const Route = createFileRoute("/resets/")({
  component: ResetRouteComponent,
  loader: async ({
                   //deps: { agents },
                   context: {queryClient},
                 }) => {
    return queryClient.ensureQueryData(resetDatesQueryOptions);
  },
});

function ResetRouteComponent() {
  const resetDates = Route.useLoaderData();

  return (
    <>
      <div className="sub-header flex flex-row gap-2">
        <h2 className="text-2xl font-bold">Resets</h2>
      </div>
      <div className="content flex flex-row gap-6">
        <div>
          <nav>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Reset Date</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead>Is Ongoing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resetDates
                  .toSorted()
                  .toReversed()
                  .map((date, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">
                        <Link
                          to="/resets/$resetDate/leaderboard"
                          params={{resetDate: date.resetDate}}
                          // search={{agents: ["WHYANDO", "SG-1-DEVX56"]}}
                          className="[&.active]:font-bold"
                        >
                          {date.resetDate}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right">{prettyDuration(date.durationMinutes * 60 * 1000)}</TableCell>
                      <TableCell>{date.isOngoing ? <CircleCheckBigIcon/> : <></>}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </nav>
        </div>

        <Outlet/>
      </div>
    </>
  );
}
