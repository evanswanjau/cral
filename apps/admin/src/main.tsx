import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { queryClient } from "./lib/query-client.js";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Last resort. AppLayout has its own boundary inside the shell; this
        one catches what breaks outside it — the router, a provider, the
        sign-in screen — where the alternative is a blank page. */}
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
