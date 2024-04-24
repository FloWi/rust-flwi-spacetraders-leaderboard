import { createFileRoute } from "@tanstack/react-router";
import { ShadcnIcons } from "../components/shadcn-icons.tsx";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="p-4 flex flex-col gap-4 w-1/2">
      <h3 className="text-xl font-bold">Welcome Home!</h3>

      <p>The backend crawls the SpaceTraders server every 5 minutes.</p>
      <p>
        I'm monitoring the official leaderboard and track every agent that
        appeared at least once. I keep tracking them even if they disappear from
        the official leaderboard. I decided to do it like that to keep the
        number of agents to track low (because of the rate-limit).
      </p>
      <p>
        It also tracks the construction of the jump gates. I'm taking their
        headquarters, search for the jump-gate waypoint in their system and then
        call the construction endpoint for it.
      </p>
    </div>
  );
}
