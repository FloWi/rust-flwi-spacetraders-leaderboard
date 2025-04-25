use anyhow::Result;
use reqwest::Url;
use reqwest_middleware::ClientWithMiddleware;

use crate::model::{
    extract_system_symbol, AgentInfoResponse, AgentSymbol, GetConstructionResponse,
    ListAgentsResponse, ListWaypointsInSystemResponse, StStatusResponse, SystemSymbol,
    WaypointSymbol,
};
use crate::pagination::PaginationInput;

pub struct StClient {
    pub(crate) client: ClientWithMiddleware,
    pub(crate) base_url: Url,
}

impl StClient {
    pub fn new(client: ClientWithMiddleware, base_url: Url) -> Self {
        StClient { client, base_url }
    }

    pub(crate) async fn get_public_agent(
        &self,
        agent_symbol: &AgentSymbol,
    ) -> Result<AgentInfoResponse> {
        let path = format!("/v2/agents/{}", agent_symbol.0);
        Ok(self
            .client
            .get(self.base_url.join(&path)?)
            .send()
            .await?
            .json()
            .await?)
    }

    pub(crate) async fn get_construction_site(
        &self,
        waypoint_symbol: &WaypointSymbol,
    ) -> Result<GetConstructionResponse> {
        let path = format!(
            "/v2/systems/{}/waypoints/{}/construction",
            extract_system_symbol(&waypoint_symbol).0,
            waypoint_symbol.0
        );
        let resp = self.client.get(self.base_url.join(&path)?).send().await;
        let construction_site_info = resp?.json().await?;
        Ok(construction_site_info)
    }

    pub(crate) async fn get_waypoints_of_type_jump_gate(
        &self,
        system_symbol: SystemSymbol,
    ) -> Result<ListWaypointsInSystemResponse> {
        let query_param_list = [("type", "JUMP_GATE")];
        let path = format!("/v2/systems/{}/waypoints", system_symbol.0);
        let request = self
            .client
            .get(self.base_url.join(&path)?)
            .query(&query_param_list);
        let resp = request.send().await;

        //TODO: implement pagination
        Ok(resp?.json().await?)
    }

    pub(crate) async fn list_waypoints_of_system_page(
        &self,
        system_symbol: &SystemSymbol,
        pagination_input: PaginationInput,
    ) -> Result<ListWaypointsInSystemResponse> {
        let query_param_list = [
            ("page", pagination_input.page.to_string()),
            ("limit", pagination_input.limit.to_string()),
        ];

        let path = format!("/v2/systems/{}/waypoints", system_symbol.0);
        let request = self
            .client
            .get(self.base_url.join(&path)?)
            .query(&query_param_list);

        let resp = request.send().await?;

        Ok(resp.json().await?)
    }

    pub(crate) async fn list_agents_page(
        &self,
        pagination_input: PaginationInput,
    ) -> ListAgentsResponse {
        let query_param_list = [
            ("page", pagination_input.page.to_string()),
            ("limit", pagination_input.limit.to_string()),
        ];

        let path = "/v2/agents";
        let request = self.client.get(path).query(&query_param_list);

        let resp = request.send().await.unwrap();

        resp.json().await.unwrap()
    }

    pub(crate) async fn get_status(&self) -> Result<StStatusResponse> {
        let path = "/v2/";
        Ok(self
            .client
            .get(self.base_url.join(&path)?)
            .send()
            .await?
            .json()
            .await?)
    }
}
