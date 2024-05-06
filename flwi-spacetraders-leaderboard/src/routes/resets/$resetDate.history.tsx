import {createFileRoute} from "@tanstack/react-router";
import {
  historyQueryOptions,
  resetDatesQueryOptions,
} from "../../utils/queryOptions.ts";
import {useSuspenseQuery} from "@tanstack/react-query";

type AgentSelectionSearch = {
  selectedAgents?: string[];
};

export const Route = createFileRoute("/resets/$resetDate/history")({
  component: HistoryComponent,
  pendingComponent: () => <div>Loading...</div>,
  staticData: {customData: "I'm the history route"},

  validateSearch: (search: Record<string, unknown>): AgentSelectionSearch => {
    // validate and parse the search params into a typed state
    return {
      selectedAgents: search?.selectedAgents as string[],
    };
  },

  loaderDeps: ({search: {selectedAgents}}) => ({selectedAgents}),

  loader: async ({
                   params: {resetDate},
                   context: {queryClient},
                   deps: {selectedAgents},
                 }) => {
    // intentional fire-and-forget according to docs :-/
    // https://tanstack.com/query/latest/docs/framework/react/guides/prefetching#router-integration
    queryClient.prefetchQuery(
      historyQueryOptions(resetDate, selectedAgents ?? []),
    );

    await queryClient.prefetchQuery(resetDatesQueryOptions);
  },
});

function HistoryComponent() {
  const {resetDate} = Route.useParams();
  const {selectedAgents} = Route.useSearch();

  // const {data: resetDates} = useSuspenseQuery(resetDatesQueryOptions);
  const {data: historyData} = useSuspenseQuery(
    historyQueryOptions(resetDate, selectedAgents ?? []),
  );

  return (
    <>
      {/*<ResetHeaderBar*/}
      {/*  resetDates={resetDates}*/}
      {/*  resetDate={resetDate}*/}
      {/*  selectedAgents={selectedAgents}*/}
      {/*  linkToSamePageDifferentResetProps={(rd) => {*/}
      {/*    return {*/}
      {/*      to: "/resets/$resetDate/history",*/}
      {/*      params: {resetDate: rd},*/}
      {/*      search: {selectedAgents},*/}
      {/*    };*/}
      {/*  }}*/}
      {/*/>*/}
      <div className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold pt-4">
          Hello /reset/{resetDate}/history!
        </h2>
        <h3 className="text-xl font-bold">Selected Agents</h3>
        <pre>{(selectedAgents ?? []).join(", ")}</pre>
        <h3 className="text-xl font-bold">History Data</h3>
        <pre>{JSON.stringify(historyData, null, 2)}</pre>
      </div>
    </>
  );
}

// It's a deep rabbit-hole. The gist is, that some of the marketplaces import raw (or intermediate) goods and produce other goods from it. The import- and export relations are listed in the wiki page. I created mermaid charts for each to make it easier to get started. If you just want to trade, you can ignore all that, but if you want to boost the production of some export goods, you have to deliver the required imports to that marketplace.
// https://discord.com/channels/792864705139048469/792864705139048472/1212776626325168169
