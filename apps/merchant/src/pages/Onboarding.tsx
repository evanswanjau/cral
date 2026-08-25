import { useQuery } from "@tanstack/react-query";
import { Button, ErrorState, LoadingState, StatusBadge } from "@cral/ui";
import { getRegistrationState } from "../lib/auth-api.js";

/**
 * Landing point right after sign-up verifies — email + password only means
 * there's real work still outstanding (phone for payouts, company papers)
 * before the account can transact, so this stands between verification and
 * the main app rather than dropping someone straight into an empty
 * dashboard. Reads `GET /auth/registration-state`, the same endpoint the
 * portal's "finish setting up" banner is meant to read from.
 *
 * The steps below are checklist placeholders, not built flows — company
 * papers and vehicle intake are later-phase work (see CLAUDE.md's phase
 * sequencing). This screen's job right now is honest: show what's
 * outstanding, not pretend the forms for it exist yet.
 */
export function Onboarding(): JSX.Element {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["registration-state"],
    queryFn: () => getRegistrationState(),
  });

  // `body` carries a dark background lifted verbatim from the auth canvas
  // (index.css) — fine behind the full-bleed sign-in panels, but this page
  // stands alone with no wrapper of its own to cover it, so every branch
  // needs its own light background or it renders dark-on-dark.
  if (isPending) {
    return (
      <div className="min-h-screen bg-white">
        <LoadingState label="Checking your account…" />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="min-h-screen bg-white">
        <ErrorState
          description={(error as Error).message}
          action={
            <Button variant="secondary" onClick={() => void refetch()}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto flex max-w-xl flex-col justify-center gap-6 px-6 py-16">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            You're verified. Let's finish setting up.
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            A couple of things stand between here and your first listing going live.
          </p>
        </div>

        <ChecklistItem
          done={data.phone_present}
          title="Add your payout number"
          description="Where your M-Pesa or bank payouts land, once a booking wraps."
        />
        <ChecklistItem
          done={data.merchant_profile_present}
          title="Submit your company papers"
          description="Checked once — every vehicle you add after that needs only three documents."
        />

        <Button variant="secondary" disabled className="mt-2 w-fit">
          Continue setup — coming soon
        </Button>
      </div>
    </div>
  );
}

function ChecklistItem({
  done,
  title,
  description,
}: {
  done: boolean;
  title: string;
  description: string;
}): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 p-4">
      <div>
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <div className="mt-1 text-sm text-slate-600">{description}</div>
      </div>
      <StatusBadge tone={done ? "verified" : "pending"} label={done ? "Done" : "Outstanding"} />
    </div>
  );
}
