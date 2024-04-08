import {createFileRoute} from '@tanstack/react-router'
import {CrateService} from "../../../generated";


type LeaderboardSearch = {
  resetDate?: string
}


export const Route = createFileRoute('/reset/leaderboard')({
  component: LeaderboardComponent,
  loaderDeps: ({search: {resetDate}}) => ({resetDate}),
  loader: async ({deps: {resetDate}}) => {
    let resetDates = await CrateService.getResetDates();

    let resetDateToUse = resetDate ? resetDate : resetDates.resetDates.toSorted().at(-1);

    let leaderboard = await CrateService.getLeaderboard({resetDate: '2024-03-24'});

    return {resetDateToUse, leaderboard};
  },

  validateSearch: (search: Record<string, unknown>): LeaderboardSearch => {
    // validate and parse the search params into a typed state
    return {
      resetDate: search?.resetDate as string,
    }
  },

})

function LeaderboardComponent() {
  const {resetDateToUse, leaderboard} = Route.useLoaderData()

  return (
    <>
      <div className="flex flex-col">
        <h1>Leaderboard for reset {resetDateToUse}</h1>
        <pre>{JSON.stringify(leaderboard, null, 2)}</pre>
      </div>
    </>
  )
}
