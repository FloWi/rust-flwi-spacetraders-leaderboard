import {createLazyFileRoute} from '@tanstack/react-router'

export const Route = createLazyFileRoute('/reset/leaderboard')({
  component: LeaderboardComponent
})

function LeaderboardComponent() {
  return (
    <>
      <div>Hello /reset/leaderboard!</div>
    </>
  )
}
