import { createFileRoute } from "@tanstack/react-router";
import { ResetHeaderBar } from "../../components/resetHeaderBar.tsx";

type AgentSelectionSearch = {
  selectedAgents?: string[];
};

export const Route = createFileRoute("/resets/$resetDate/history")({
  component: HistoryComponent,
  validateSearch: (search: Record<string, unknown>): AgentSelectionSearch => {
    // validate and parse the search params into a typed state
    return {
      selectedAgents: search?.selectedAgents as string[],
    };
  },

  loaderDeps: ({ search: { selectedAgents } }) => ({ selectedAgents }),
});

function HistoryComponent() {
  const { resetDate } = Route.useParams();
  const { selectedAgents } = Route.useSearch();

  return (
    <>
      <ResetHeaderBar resetDate={resetDate} selectedAgents={selectedAgents} />
      <div className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold pt-4">
          Hello /reset/{resetDate}/history!
        </h2>
        <pre>selectedAgents: {(selectedAgents ?? []).join(", ")}</pre>
      </div>
    </>
  );
}

// It's a deep rabbit-hole. The gist is, that some of the marketplaces import raw (or intermediate) goods and produce other goods from it. The import- and export relations are listed in the wiki page. I created mermaid charts for each to make it easier to get started. If you just want to trade, you can ignore all that, but if you want to boost the production of some export goods, you have to deliver the required imports to that marketplace.
// https://discord.com/channels/792864705139048469/792864705139048472/1212776626325168169
