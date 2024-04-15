import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'

export const Route = createRootRoute({
  component: () => (
    <>
      <div>
      <div className="p-2 flex gap-2 ">
        <Link to="/resets" className="[&.active]:font-bold">
          Resets
        </Link>
        <Link to="/all-time" className="[&.active]:font-bold">
          All Time Comparison
        </Link>
      </div>
      <hr />
      <Outlet />
      </div>
      <TanStackRouterDevtools />

    </>
  ),
})
