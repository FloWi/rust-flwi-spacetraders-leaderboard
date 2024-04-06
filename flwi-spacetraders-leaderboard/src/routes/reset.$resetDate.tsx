import {createFileRoute} from '@tanstack/react-router'

export const Route = createFileRoute('/reset/$resetDate')({
  component: ResetComponent,
})

function ResetComponent() {
  const {resetDate} = Route.useParams()
  return <div>Hello Reset {resetDate}</div>
}
