import { useQueries } from "react-query";
import {
  Batcher,
  create,
  keyResolver,
  windowScheduler,
} from "@yornaath/batshit";

const agentHistories: Batcher<HistoryData[], string> = create({
  fetcher: async (agentSymbols: string[]) => {
    return getBatchedHistoryData(agentSymbols);
  },
  resolver: keyResolver("agentSymbol"),
  scheduler: windowScheduler(10),
});

const userQueries = (agentSymbols: string[]) =>
  useQueries({
    queries: agentSymbols.map((agentSymbol) => {
      return {
        queryKey: ["user", agentSymbol],
        queryFn: () => getHistoryData(agentSymbol),
      };
    }),
  });

interface HistoryData {
  data: {};
  agentSymbol: string;
}

export async function getBatchedHistoryData(
  agentSymbols: string[],
): Promise<HistoryData[]> {
  console.log("loading history data for agentSymbols", agentSymbols);

  let foo = agentSymbols.map((a) => {
    return {
      agentSymbol: a,
      data: {},
    };
  });

  return foo;
}

export async function getHistoryData(
  agentSymbol: string,
): Promise<HistoryData> {
  console.log("loading history data for agentSymbol", agentSymbol);

  return {
    agentSymbol,
    data: {},
  };
}
