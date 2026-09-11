import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import App from "./App";
import "./index.css";

// The database is a local SQLite file — reads are effectively free, so we favour
// always-fresh data over caching. Every screen refetches on mount and on window
// focus, and any successful write refreshes every mounted query.
const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSettled: () => {
      queryClient.invalidateQueries();
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 0,
      gcTime: 5 * 60_000,
      refetchOnMount: true,
      refetchOnWindowFocus: true,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

// Restore theme before first paint.
const savedTheme = localStorage.getItem("mna.theme");
if (savedTheme === "dark" || (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
  document.documentElement.classList.add("dark");
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <App />
      </HashRouter>
      <Toaster richColors position="bottom-right" closeButton />
    </QueryClientProvider>
  </React.StrictMode>,
);
