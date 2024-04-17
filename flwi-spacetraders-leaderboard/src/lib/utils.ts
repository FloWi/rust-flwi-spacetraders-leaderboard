import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { ApiLeaderboardEntry, CrateService } from "../../generated";
import { create } from "zustand";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function zip<T, U>(a: T[], b: U[]): [T, U][] {
  const length = Math.min(a.length, b.length);
  const result: [T, U][] = [];
  for (let i = 0; i < length; i++) {
    result.push([a[i], b[i]]);
  }
  return result;
}

interface ApiAgentHistory {
  agentSymbol: string;
  entries: string[];
}

interface ResetFetchState {
  lastRefresh: Date;
  leaderboard: ApiLeaderboardEntry[];
  historyData: ApiAgentHistory[];
}

interface FetchState {
  lastRefresh: Date;
  selectedAgents: string[];
  resetDates: string[];
  fetchStates: Map<string, ResetFetchState>;
}

type Action = {
  updateFetchData: (
    resetDate: string,
    newAgentSelection: string[],
  ) => Promise<void>;
  refreshResetDatesIfNecessary: (
    getResetDates: () => Promise<string[]>,
  ) => Promise<void>;
};

async function loadResetFetchState(
  resetDate: string,
): Promise<ResetFetchState> {
  let leaderboard = await CrateService.getLeaderboard({ resetDate });
  return {
    historyData: [],
    lastRefresh: new Date(),
    leaderboard: leaderboard.leaderboardEntries,
  };
}

async function computeNewState(
  resetDate: string,
  state: FetchState,
  newAgentSelection: string[],
): Promise<FetchState> {
  let currentResetState =
    state.fetchStates.get(resetDate) ?? (await loadResetFetchState(resetDate));

  let currentAgentSymbols = currentResetState.historyData.map(
    (e) => e.agentSymbol,
  );

  let notIncluded = newAgentSelection.filter(
    (queryParamAgent) => !currentAgentSymbols.includes(queryParamAgent),
  );

  let newEntries = notIncluded.map((agentSymbol) => ({
    agentSymbol,
    entries: [],
  }));

  let updated = {
    ...state,
    selectedAgents: newAgentSelection,
    fetchStates: new Map(state.fetchStates).set(resetDate, {
      ...currentResetState,
      historyData: currentResetState.historyData.concat(newEntries),
    }),
  };

  console.log("currentAgentSymbols in cache", currentAgentSymbols);
  console.log("newAgentSelection", newAgentSelection);
  console.log("notIncluded", notIncluded);
  console.log("updated state", updated);

  return updated;
}

export const useFetchState = create<FetchState & Action>((set, get) => ({
  selectedAgents: [],
  lastRefresh: new Date(),
  resetDates: [],
  fetchStates: new Map(),
  updateFetchData: async (resetDate: string, newAgentSelection: string[]) => {
    let current = get();
    let newState = await computeNewState(resetDate, current, newAgentSelection);
    set(() => newState);
  },
  refreshResetDatesIfNecessary: async (getRefreshDatesFn) => {
    let current = get();
    let now = new Date();
    let ageInMs = now.getTime() - current.lastRefresh.getTime();
    let isExpired = ageInMs > 5 * 60 * 1000;
    if (current.resetDates.length == 0 || isExpired) {
      let newResetDates = await getRefreshDatesFn();
      set(() => ({ ...current, resetDates: newResetDates }));
    }
  },
}));
