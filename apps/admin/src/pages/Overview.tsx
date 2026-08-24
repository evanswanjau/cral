import { useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState, StatusBadge } from "@cral/ui";
import { apiGet } from "../lib/api.js";

interface ReadyzResponse {
  status: "ok" | "degraded";
  checks: Record<string, "ok" | "down">;
}

/**
 * Placeholder Overview page. Its only job right now is to prove the whole
 * Phase 0 pipeline end to end: fetch -> real API -> real DB/Redis check ->
 * rendered through the shared UI kit's loading/error/empty states.
 */
export function Overview(): JSX.Element {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["readyz"],
    queryFn: () => apiGet<ReadyzResponse>("/readyz"),
  });

  if (isPending) return <LoadingState label="Checking platform status…" />;
  if (isError) return <ErrorState description={(error as Error).message} />;
  if (!data) return <EmptyState title="Nothing here yet" />;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-white">Queues</h1>
      <div className="flex flex-wrap gap-2 rounded-lg bg-slate-100 p-4">
        {Object.entries(data.checks).map(([name, state]) => (
          <StatusBadge
            key={name}
            tone={state === "ok" ? "verified" : "rejected"}
            label={`${name}: ${state}`}
          />
        ))}
      </div>
    </div>
  );
}
