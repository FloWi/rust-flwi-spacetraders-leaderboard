import { queryOptions } from "@tanstack/react-query";
import { CrateService } from "../../generated";
import * as _ from "lodash";
import { RangeSelection } from "./rangeSelection.ts";

export const resetDatesQueryOptions = queryOptions({
  queryKey: ["resetDates"],
  queryFn: () => CrateService.getResetDates().then((r) => r.resetDates),
  staleTime: 5 * 60 * 1000,
});

export const jumpGateAssignmentsQueryOptions = (resetDate: string) =>
  queryOptions({
    queryKey: ["jumpGateData", resetDate],
    queryFn: () => CrateService.getJumpGateAgentsAssignment({ resetDate }),
    staleTime: 5 * 60 * 1000,
  });

export const jumpGateMostRecentProgressQueryOptions = (resetDate: string) =>
  queryOptions({
    queryKey: ["jumpGateMostRecentProgressData", resetDate],
    queryFn: () => CrateService.getJumpGateMostRecentProgress({ resetDate }),
    staleTime: 5 * 60 * 1000,
  });

export const leaderboardQueryOptions = (resetDate: string) =>
  queryOptions({
    queryKey: ["leaderboardData", resetDate],
    queryFn: () => CrateService.getLeaderboard({ resetDate }),
    staleTime: 5 * 60 * 1000,
  });

export const historyBaseQueryKey = (resetDate: string, rangeSelection: RangeSelection) => {
  return ["historyData", resetDate, rangeSelection.selectionMode, rangeSelection.hoursGte, rangeSelection.hoursLte];
};

export const preciseHistoryQueryOptions = (resetDate: string, agentSymbols: string[], rangeSelection: RangeSelection) =>
  queryOptions({
    queryKey: [...historyBaseQueryKey(resetDate, rangeSelection), { agentSymbols: _.sortBy(_.uniq(agentSymbols)) }],
    queryFn: () =>
      CrateService.getHistoryDataForReset({
        resetDate,
        requestBody: { agent_symbols: agentSymbols },
      }),
    staleTime: 5 * 60 * 1000,
  });

/*
<select class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500">
<option value="6">Last 6h</option>
<option value="12">Last 12h</option>
<option value="24">Last 24h</option>
<option value="48">Last 2 days</option>
<option value="168">Last 7 days</option>
<option value="336">Last 14 days</option></select>
 */
