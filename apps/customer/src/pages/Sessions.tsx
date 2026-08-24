import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, EmptyState, ErrorState, LoadingState, StatusBadge } from "@cral/ui";
import { listSessions, logout, revokeSession } from "../lib/auth-api.js";
import { setSession } from "../lib/auth.js";

/** "Where you're signed in" — spec §5's /auth/sessions, rendered per device. */
export function Sessions(): JSX.Element {
  const queryClient = useQueryClient();
  const { data, isPending, isError } = useQuery({ queryKey: ["sessions"], queryFn: listSessions });

  const revokeMutation = useMutation({
    mutationFn: revokeSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });

  const signOutEverywhereMutation = useMutation({
    mutationFn: () => logout(true),
    onSuccess: () => setSession(null),
  });

  if (isPending) return <LoadingState label="Loading your sessions…" />;
  if (isError) return <ErrorState description="Couldn't load your sessions. Try again shortly." />;
  if (data.data.length === 0) return <EmptyState title="No active sessions" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Where you're signed in</h1>
        <Button variant="secondary" onClick={() => signOutEverywhereMutation.mutate()}>
          Sign out everywhere
        </Button>
      </div>
      <ul className="flex flex-col gap-2">
        {data.data.map((session) => (
          <li
            key={session.id}
            className="flex items-center justify-between rounded border border-slate-200 p-3"
          >
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">{session.device}</span>
              <span className="text-xs text-slate-500">
                Last active {new Date(session.last_seen_at).toLocaleString()}
              </span>
              {session.is_current && <StatusBadge tone="success" label="This device" />}
            </div>
            {!session.is_current && (
              <Button
                variant="secondary"
                onClick={() => revokeMutation.mutate(session.id)}
                disabled={revokeMutation.isPending}
              >
                Sign out
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
