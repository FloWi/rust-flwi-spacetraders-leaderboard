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
      selectedAgents: search?.agents as string[],
    };
  },

  loaderDeps: ({ search: { selectedAgents } }) => ({ agents: selectedAgents }),
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
