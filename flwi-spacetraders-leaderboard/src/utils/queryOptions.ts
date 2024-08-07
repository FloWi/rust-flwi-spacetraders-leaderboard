import { queryOptions } from "@tanstack/react-query";
import * as _ from "lodash";
import { RangeSelection } from "./rangeSelection.ts";
import {
  getAllTimeConstructionLeaderboard,
  getAllTimePerformance,
  getHistoryDataForReset,
  getJumpGateAgentsAssignment,
  getJumpGateConstructionEventOverview,
  GetJumpGateConstructionEventOverviewResponse,
  getJumpGateMostRecentProgress,
  getLeaderboard,
  getResetDates,
} from "../../generated";

export const resetDatesQueryOptions = queryOptions({
  queryKey: ["resetDates"],
  queryFn: () =>
    getResetDates().then((response) => {
      // TODO: dates are _not_ parsed currently. check if openapi-ts fixed the Date issue
      // https://github.com/hey-api/openapi-ts/issues/145
      return response.resetDates.map((r) => {
        return { ...r, firstTs: new Date(Date.parse(r.firstTs.toString())) };
      });
    }),
  staleTime: 5 * 60 * 1000,
});

export const jumpGateAssignmentsQueryOptions = (resetDate: string) =>
  queryOptions({
    queryKey: ["jumpGateData", resetDate],
    queryFn: () => getJumpGateAgentsAssignment({ resetDate }),
    staleTime: 5 * 60 * 1000,
  });

export const jumpGateMostRecentProgressQueryOptions = (resetDate: string) =>
  queryOptions({
    queryKey: ["jumpGateMostRecentProgressData", resetDate],
    queryFn: () => getJumpGateMostRecentProgress({ resetDate }),
    staleTime: 5 * 60 * 1000,
  });

export const jumpGateConstructionEventsQueryOptions = (resetDate: string) =>
  queryOptions({
    queryKey: ["jumpGateConstructionEventsData", resetDate],
    queryFn: async () => {
      const response: GetJumpGateConstructionEventOverviewResponse = await getJumpGateConstructionEventOverview({
        resetDate,
      });

      // TODO: dates are _not_ parsed currently. check if openapi-ts fixed the Date issue
      // https://github.com/hey-api/openapi-ts/issues/145

      const fixed: GetJumpGateConstructionEventOverviewResponse = {
        ...response,
        eventEntries: response.eventEntries.map((e) => {
          return {
            ...e,
            tsFirstConstructionEvent: new Date(Date.parse(e.tsFirstConstructionEvent.toString())),
            tsLastConstructionEvent: e.tsLastConstructionEvent
              ? new Date(Date.parse(e.tsLastConstructionEvent.toString()))
              : undefined,
            tsStartOfReset: new Date(Date.parse(e.tsStartOfReset.toString())),
          };
        }),
      };
      console.log("fixed", fixed);

      return fixed;
    },
    staleTime: 5 * 60 * 1000,
  });

export const leaderboardQueryOptions = (resetDate: string) =>
  queryOptions({
    queryKey: ["leaderboardData", resetDate],
    queryFn: () => getLeaderboard({ resetDate }),
    staleTime: 5 * 60 * 1000,
  });

export const historyBaseQueryKey = (resetDate: string, rangeSelection: RangeSelection) => {
  return ["historyData", resetDate, rangeSelection.selectionMode, rangeSelection.hoursGte, rangeSelection.hoursLte];
};

export const preciseHistoryQueryOptions = (resetDate: string, agentSymbols: string[], rangeSelection: RangeSelection) =>
  queryOptions({
    queryKey: [...historyBaseQueryKey(resetDate, rangeSelection), { agentSymbols: _.sortBy(_.uniq(agentSymbols)) }],
    queryFn: () => {
      return getHistoryDataForReset({
        resetDate,
        requestBody: {
          agentSymbols,
          selectionMode: rangeSelection.selectionMode,
          eventTimeMinutesGte: rangeSelection.hoursGte ? rangeSelection.hoursGte * 60 : undefined,
          eventTimeMinutesLte: rangeSelection.hoursLte * 60,
        },
      });
    },
    staleTime: 5 * 60 * 1000,
  });

export const allTimePerformanceQueryOptions = queryOptions({
  queryKey: ["all-time-performance"],
  queryFn: () => getAllTimePerformance(),
  staleTime: 5 * 60 * 1000,
});

export const allTimeConstructionLeaderboardOptions = queryOptions({
  queryKey: ["all-time-construction-leaderboard"],
  queryFn: () => getAllTimeConstructionLeaderboard(),
  staleTime: 5 * 60 * 1000,
});
