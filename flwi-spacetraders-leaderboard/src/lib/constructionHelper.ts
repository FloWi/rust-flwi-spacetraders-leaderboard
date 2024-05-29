import type {
  ApiJumpGateConstructionEventOverviewEntry,
  GetJumpGateAgentsAssignmentForResetResponseContent,
} from "../../generated";
import * as _ from "lodash";
import {durationMillis} from "./utils.ts";

export function extractSystemSymbol(waypointSymbol: string): string {
  return waypointSymbol.split("-").slice(0, 2).join("-");
}

export interface MaterialSummary {
  tradeSymbol: string;
  numStartedDeliveries: number;
  numCompletedDeliveries: number;
  fastestFirstDeliveryMs: number;
  fastestLastDeliveryMs: number | undefined;
  fastestConstructionMs: number | undefined;
}

export function aggregateMaterialsSummary(
  constructionProgress: ApiJumpGateConstructionEventOverviewEntry[],
): MaterialSummary[] {
  const relevant = constructionProgress.filter((cp) => cp.required > 1); //filter out quantum stabilizers

  const materials = Array.from(new Set(relevant.map((cp) => cp.tradeSymbol))).toSorted();

  return materials.flatMap((tradeSymbol) => {
    const entries = relevant.filter((cp) => cp.tradeSymbol === tradeSymbol);
    const startedDeliveries = entries.filter((cp) => cp.fulfilled > 0);
    const completedDeliveries = entries.filter((cp) => cp.fulfilled === cp.required);

    const resetStartTs = entries.at(0)?.tsStartOfReset;

    if (resetStartTs) {
      const startedDeliveriesMs = startedDeliveries.map((cp) => {
        return {
          ...cp,
          durationMs: durationMillis(resetStartTs, cp.tsFirstConstructionEvent),
        };
      });

      const sortedFirstDelieries = _.sortBy(startedDeliveriesMs, (e) => e.durationMs);

      const fastestFirstDelivery = sortedFirstDelieries.at(0);

      const completedDeliveriesMs = completedDeliveries.flatMap((cp) => {
        return cp.tsLastConstructionEvent
          ? [
            {
              ...cp,
              durationMs: durationMillis(resetStartTs, cp.tsLastConstructionEvent),
              constructionDurationMs: durationMillis(cp.tsFirstConstructionEvent, cp.tsLastConstructionEvent),
            },
          ]
          : [];
      });

      const sortedLastDeliveries = _.sortBy(completedDeliveriesMs, (e) => e.durationMs);
      const fastestLastDelivery = sortedLastDeliveries.at(0);

      return [
        {
          tradeSymbol,
          numStartedDeliveries: startedDeliveries.length,
          numCompletedDeliveries: completedDeliveries.length,
          fastestFirstDeliveryMs: fastestFirstDelivery?.durationMs,
          fastestLastDeliveryMs: fastestLastDelivery?.durationMs,
          fastestConstructionMs: fastestLastDelivery?.constructionDurationMs,
        } as MaterialSummary,
      ];
    } else {
      return [] as MaterialSummary[];
    }
  });
}

export const aggregateJumpGateStats = (
  constructionProgress: ApiJumpGateConstructionEventOverviewEntry[],
  agentAssignment: GetJumpGateAgentsAssignmentForResetResponseContent,
) => {
  const numTrackedAgents = agentAssignment.jumpGateAssignmentEntries.flatMap((a) => a.agentsInSystem).length;
  const numTrackedJumpGates = agentAssignment.jumpGateAssignmentEntries.length;

  const relevant = constructionProgress.filter((cp) => cp.required > 1);
  const numJumpGatesWithStartedProduction = new Set(
    relevant.filter((cp) => cp.fulfilled > 0).map((cp) => cp.jumpGateWaypointSymbol),
  ).size;

  const numCompletedJumpGates = new Set(
    relevant.filter((cp) => cp.isJumpGateComplete).map((cp) => cp.jumpGateWaypointSymbol),
  ).size;

  return {
    numTrackedAgents,
    numTrackedJumpGates,
    numJumpGatesWithStartedProduction,
    numCompletedJumpGates,
  };
};
