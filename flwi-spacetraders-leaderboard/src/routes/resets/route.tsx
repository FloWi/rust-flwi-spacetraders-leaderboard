import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/resets")({
  component: ResetRouteComponent,
});

function ResetRouteComponent() {
  return (
    <>
      <Outlet />
    </>
  );
}
