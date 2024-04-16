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
  fetchStates: Map<string, ResetFetchState>;
}

type Action = {
  updateFetchData: (
    resetDate: string,
    newAgentSelection: string[],
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
  let current =
    state.fetchStates.get(resetDate) ?? (await loadResetFetchState(resetDate));

  let currentAgentSymbols = current.historyData.map((e) => e.agentSymbol);

  let notIncluded = newAgentSelection.filter(
    (queryParamAgent) => !currentAgentSymbols.includes(queryParamAgent),
  );

  console.log("currentAgentSymbols in cache", currentAgentSymbols);
  console.log("newAgentSelection", newAgentSelection);
  console.log("notIncluded", notIncluded);

  let newEntries = notIncluded.map((agentSymbol) => ({
    agentSymbol,
    entries: [],
  }));

  let updated = {
    fetchStates: new Map(state.fetchStates).set(resetDate, {
      ...current,
      historyData: newEntries,
    }),
  };

  return updated;
}

export const useFetchState = create<FetchState & Action>((set, get) => ({
  fetchStates: new Map(),
  updateFetchData: async (resetDate: string, newAgentSelection: string[]) => {
    let current = get();
    let newState = await computeNewState(resetDate, current, newAgentSelection);
    set(() => newState);
  },
}));
