import {createFileRoute, Outlet} from "@tanstack/react-router";

export const Route = createFileRoute("/resets")({
  component: ResetRouteComponent,
});

function ResetRouteComponent() {
  return (
    <div className="p-2 md:p-4">
      <Outlet/>
    </div>
  );
}
