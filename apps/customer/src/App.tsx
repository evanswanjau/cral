import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { SiteShell } from "./components/site/SiteShell.js";
import { Home } from "./pages/Home.js";
import { Browse } from "./pages/Browse.js";
import { CarDetail } from "./pages/CarDetail.js";
import { Booking } from "./pages/Booking.js";
import { Documents } from "./pages/Documents.js";
import { Trips } from "./pages/Trips.js";
import { TripDetail } from "./pages/TripDetail.js";
import { ComingSoon } from "./pages/ComingSoon.js";
import { RequireAuth } from "./components/RequireAuth.js";
import { SignIn } from "./pages/SignIn.js";
import { CreateAccount } from "./pages/CreateAccount.js";
import { ForgotPassword } from "./pages/ForgotPassword.js";
import { ResetPassword } from "./pages/ResetPassword.js";
import { Sessions } from "./pages/Sessions.js";

/**
 * Route map. Everything sits under `SiteShell` (masthead + footer) -
 * including the auth-gated pages, so a signed-out visitor redirected to
 * `/sign-in?next=...` and a signed-in one on `/trips` see the same frame.
 * `RequireAuth` now preserves the path it interrupted.
 *
 * The seven marketing pages still resolve to a `ComingSoon` placeholder -
 * the home page links to them, so they must not hard-404. Each gets its
 * real screen in a later PR. `/trips/:id` has no handover-code step yet
 * (Cruz Customer Portal.dc.html, not pulled) - see docs/plans C8.
 */
const router = createBrowserRouter([
  {
    element: <SiteShell />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/browse", element: <Browse /> },
      { path: "/cars/:id", element: <CarDetail /> },
      { path: "/how-it-works", element: <ComingSoon title="How it works" /> },
      { path: "/how-we-protect-you", element: <ComingSoon title="How we protect you" /> },
      { path: "/corporate", element: <ComingSoon title="Corporate hire" /> },
      { path: "/about", element: <ComingSoon title="About CRAL" /> },
      { path: "/help", element: <ComingSoon title="Questions and answers" /> },
      { path: "/contact", element: <ComingSoon title="Contact us" /> },
      { path: "/legal", element: <ComingSoon title="Terms and privacy" /> },
      { path: "/list-your-car", element: <ComingSoon title="List your car" /> },

      { path: "/sign-in", element: <SignIn /> },
      { path: "/create-account", element: <CreateAccount /> },
      { path: "/forgot-password", element: <ForgotPassword /> },
      { path: "/reset-password", element: <ResetPassword /> },

      {
        element: <RequireAuth />,
        children: [
          { path: "/book/:id", element: <Booking /> },
          { path: "/documents", element: <Documents /> },
          { path: "/trips", element: <Trips /> },
          { path: "/trips/:id", element: <TripDetail /> },
          { path: "/account", element: <Sessions /> },
        ],
      },
    ],
  },
]);

export function App(): JSX.Element {
  return <RouterProvider router={router} />;
}
