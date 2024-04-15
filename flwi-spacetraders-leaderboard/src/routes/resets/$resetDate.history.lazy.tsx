import { createLazyFileRoute } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/resets/$resetDate/history')({
  component: () => <div>Hello /reset/$resetDate/history!</div>
});
