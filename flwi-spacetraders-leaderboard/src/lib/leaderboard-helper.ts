import {ApiLeaderboardEntry} from "../../generated";
import {zipRepeat2nd} from "./utils.ts";
import {chartColors} from "../utils/chartColors.ts";

export function calcSortedAndColoredLeaderboard(
  leaderboard: ApiLeaderboardEntry[],
) {
  let sortedEntries = leaderboard
    .toSorted((a, b) => a.credits - b.credits)
    .toReversed();

  let sortedAndColoredLeaderboard: UiLeaderboardEntry[] = zipRepeat2nd(
    sortedEntries,
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
