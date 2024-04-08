import { createLazyFileRoute } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/reset/history')({
  component: () => <div>Hello /reset/$resetDate/history!</div>
});
