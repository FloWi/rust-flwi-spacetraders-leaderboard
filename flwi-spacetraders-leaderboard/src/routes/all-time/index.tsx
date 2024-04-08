import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/all-time/')({
  component: () => <div>Hello /all-time/!</div>
})