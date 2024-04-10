import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'

export const Route = createRootRoute({
  component: () => (
    <>
      <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white min-h-screen">
      <div className="p-2 flex gap-2 ">
        <Link to="/reset" className="[&.active]:font-bold">
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
