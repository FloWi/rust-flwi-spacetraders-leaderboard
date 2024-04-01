use serde::{Deserialize, Serialize};

use crate::model::{AgentSymbol, ConstructionMaterial, FactionSymbol, WaypointSymbol};

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LeaderboardStaticAgentInfo {
    pub symbol: AgentSymbol,
    pub headquarters: WaypointSymbol,
    pub starting_faction: FactionSymbol,
    pub jump_gate: WaypointSymbol,
}

#[derive(Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LeaderboardCurrentAgentInfo {
    pub symbol: AgentSymbol,
    pub credits: i64,
    pub ship_count: u32,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LeaderboardCurrentConstructionInfo {
    pub symbol: WaypointSymbol,
    pub materials: Vec<ConstructionMaterial>,
    pub is_complete: bool,
}
