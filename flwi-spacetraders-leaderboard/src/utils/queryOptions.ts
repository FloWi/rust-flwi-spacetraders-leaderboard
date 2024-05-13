import { queryOptions } from "@tanstack/react-query";
import { CrateService } from "../../generated";

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

export const leaderboardQueryOptions = (resetDate: string) =>
  queryOptions({
    queryKey: ["leaderboardData", resetDate],
    queryFn: () => CrateService.getLeaderboard({ resetDate }),
    staleTime: 5 * 60 * 1000,
  });

export const historyQueryOptions = (
  resetDate: string,
  agentSymbols: string[],
) =>
  queryOptions({
    queryKey: ["historyData", resetDate],
    queryFn: () =>
      CrateService.getHistoryDataForReset({
        resetDate,
        requestBody: { agent_symbols: agentSymbols },
      }),
    staleTime: 5 * 60 * 1000,
  });
