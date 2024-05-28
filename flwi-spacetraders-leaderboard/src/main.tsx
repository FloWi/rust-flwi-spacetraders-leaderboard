import {StrictMode} from "react";
import ReactDOM from "react-dom/client";
import {createRouter, RouterProvider} from "@tanstack/react-router";
import "./index.css";
import {ThemeProvider} from "./@/components/theme-provider.tsx";

// Import the generated route tree
import {routeTree} from "./routeTree.gen";
import {OpenAPI} from "../generated";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {ReactQueryDevtools} from "@tanstack/react-query-devtools";

// Setting a mutable variable seems to be the way to go in js-land :sob:
OpenAPI.BASE = `${window.location.origin}`;

// Create a new router instance

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const queryClient = new QueryClient();

const router = createRouter({
  routeTree,
  context: {queryClient},
  defaultPreload: "intent",
  // Since we're using React Query, we don't want loader calls to ever be stale
  // This will ensure that the loader is always called when the route is preloaded or visited
  defaultPreloadStaleTime: 0,
  defaultGcTime: 5 * 60 * 1000,
});

// Render the app
const rootElement = document.getElementById("root")!;
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router}/>
          <ReactQueryDevtools initialIsOpen/>
        </QueryClientProvider>
      </ThemeProvider>
    </StrictMode>,
  );
}
