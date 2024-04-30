import {queryOptions} from "@tanstack/react-query";
import {CrateService} from "../../generated";

export const resetDatesQueryOptions = queryOptions({
  queryKey: ["resetDates"],
  queryFn: () => CrateService.getResetDates().then((r) => r.resetDates),
  staleTime: 5 * 60 * 1000,
});

export const jumpGateQueryOptions = (resetDate: string) =>
  queryOptions({
    queryKey: ["jumpGateData", resetDate],
    queryFn: () => CrateService.getJumpGateAgentsAssignment({resetDate}),
    staleTime: 5 * 60 * 1000,
  });
export const leaderboardQueryOptions = (resetDate: string) =>
  queryOptions({
    queryKey: ["leaderboardData", resetDate],
    queryFn: () => CrateService.getLeaderboard({resetDate}),
    staleTime: 5 * 60 * 1000,
  });
