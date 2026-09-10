import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { queryClient } from "./lib/query-client.js";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Last resort. SiteShell has its own boundary inside the frame, which
        catches almost everything and keeps the masthead; this one is for
        what breaks outside or underneath it - the router, a provider, an
        auth screen - where the alternative is a blank white page. */}
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
