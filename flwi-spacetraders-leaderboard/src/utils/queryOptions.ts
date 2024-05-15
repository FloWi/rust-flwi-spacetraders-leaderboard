import {queryOptions} from "@tanstack/react-query";
import {CrateService} from "../../generated";
import * as _ from "lodash";

export const resetDatesQueryOptions = queryOptions({
  queryKey: ["resetDates"],
  queryFn: () => CrateService.getResetDates().then((r) => r.resetDates),
  staleTime: 5 * 60 * 1000,
});

export const jumpGateAssignmentsQueryOptions = (resetDate: string) =>
  queryOptions({
    queryKey: ["jumpGateData", resetDate],
    queryFn: () => CrateService.getJumpGateAgentsAssignment({resetDate}),
    staleTime: 5 * 60 * 1000,
  });

export const jumpGateMostRecentProgressQueryOptions = (resetDate: string) =>
  queryOptions({
    queryKey: ["jumpGateMostRecentProgressData", resetDate],
    queryFn: () => CrateService.getJumpGateMostRecentProgress({resetDate}),
    staleTime: 5 * 60 * 1000,
  });

export const leaderboardQueryOptions = (resetDate: string) =>
  queryOptions({
    queryKey: ["leaderboardData", resetDate],
    queryFn: () => CrateService.getLeaderboard({resetDate}),
    staleTime: 5 * 60 * 1000,
  });

export const historyBaseQueryKey = (resetDate: string) => ["historyData", resetDate];

export const preciseHistoryQueryOptions = (resetDate: string, agentSymbols: string[]) =>
  queryOptions({
    queryKey: [...historyBaseQueryKey(resetDate), {agentSymbols: _.sortBy(_.uniq(agentSymbols))}],
    queryFn: () =>
      CrateService.getHistoryDataForReset({
        resetDate,
        requestBody: {agent_symbols: agentSymbols},
      }),
    staleTime: 5 * 60 * 1000,
  });
