import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/resets/$resetDate/jump-gate')({
  component: () => <div>Hello /resets/jump-gate!</div>
})
