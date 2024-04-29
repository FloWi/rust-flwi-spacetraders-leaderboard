import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="flex flex-col gap-4 w-11/12 md:w-1/2">
      <h3 className="text-xl font-bold">How to leaderboard?</h3>

      <p>The backend crawls the SpaceTraders server every 5 minutes.</p>
      <p>
        To get the collection of agents under surveillance I'm checking the
        official leaderboard and track every agent that appeared at least once
        and keep tracking them even if they disappear again. I decided to do it
        like that to keep the number of agents to track low (because of the
        rate-limit) without the need to maintain a list manually.
      </p>
      <p>
        It also tracks the construction of the jump gates. I'm taking their
        headquarters, search for the jump-gate waypoint in their system and then
        call the construction endpoint for it.
      </p>
    </div>
  );
}
