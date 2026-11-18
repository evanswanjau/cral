import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AuthShell } from "../components/auth/AuthShell.jsx";
import { takeAssistTokenFromFragment } from "../lib/assist.js";
import { usePageTitle } from "../lib/use-page-title.js";

/**
 * `/assist#token=...` - where the Ops console sends a sales agent after the
 * owner reads them the code (Phase 3, PR AG3). Takes the token out of the
 * fragment and goes straight to onboarding. `?ended=1` is where Exit lands.
 */
export function Assist(): JSX.Element {
  usePageTitle("Filling in for an owner");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const ended = params.get("ended") === "1";
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (ended) return;
    if (takeAssistTokenFromFragment()) navigate("/onboarding", { replace: true });
    else setFailed(true);
  }, [ended, navigate]);

  if (ended || failed) {
    return (
      <AuthShell
        panel="signin"
        heading={ended ? "You've stopped filling this in" : "That link didn't work"}
        subheading={
          ended
            ? "Everything you added is saved for the owner. They add their payout details, accept the terms and send it for review from their own account."
            : "Assist links work once, in the tab they open in, for one hour. Go back to My merchants in CRAL Ops and start again with a new code."
        }
        error={null}
      >
        <p style={{ margin: 0, font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" }}>
          You can close this tab. <Link to="/sign-in">Sign in</Link> is for owners only.
        </p>
      </AuthShell>
    );
  }
  return <div />;
}
