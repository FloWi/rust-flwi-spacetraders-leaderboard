import {ApiLeaderboardEntry} from "../../generated";
import {zip} from "./utils.ts";
import {chartColors} from "../utils/chartColors.ts";

export function calcSortedAndColoredLeaderboard(
  leaderboard: ApiLeaderboardEntry[],
) {
  let sortedEntries = leaderboard
    .toSorted((a, b) => a.credits - b.credits)
    .toReversed();

  let sortedAndColoredLeaderboard: UiLeaderboardEntry[] = zip(
    sortedEntries.slice(0, 30),
    chartColors,
  ).map(([e, c]) => ({
    displayColor: c,
    ...e,
  }));

  return {sortedAndColoredLeaderboard};
}

export interface UiLeaderboardEntry extends ApiLeaderboardEntry {
  //selected: boolean
  displayColor: string;
}
