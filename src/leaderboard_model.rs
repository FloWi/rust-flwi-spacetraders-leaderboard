use serde::{Deserialize, Serialize};

use crate::model::{AgentSymbol, FactionSymbol, WaypointSymbol};

#[derive(Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LeaderboardStaticAgentInfo {
    pub symbol: AgentSymbol,
    pub headquarters: WaypointSymbol,
    pub starting_faction: FactionSymbol,
    pub jump_gate: WaypointSymbol,
}
