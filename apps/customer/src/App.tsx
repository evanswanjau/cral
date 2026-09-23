import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { SiteShell } from "./components/site/SiteShell.js";
import { Home } from "./pages/Home.js";
import { Browse } from "./pages/Browse.js";
import { Parts } from "./pages/Parts.js";
import { Services } from "./pages/Services.js";
import { Towing } from "./pages/Towing.js";
import { CarDetail } from "./pages/CarDetail.js";
import { Booking } from "./pages/Booking.js";
import { Documents } from "./pages/Documents.js";
import { Trips } from "./pages/Trips.js";
import { TripDetail } from "./pages/TripDetail.js";
import { Notifications } from "./pages/Notifications.js";
import { HowItWorks } from "./pages/HowItWorks.js";
import { HowWeProtectYou } from "./pages/HowWeProtectYou.js";
import { Corporate } from "./pages/Corporate.js";
import { About } from "./pages/About.js";
import { Help } from "./pages/Help.js";
import { Contact } from "./pages/Contact.js";
import { Legal } from "./pages/Legal.js";
import { RequireAuth } from "./components/RequireAuth.js";
import { SignIn } from "./pages/SignIn.js";
import { CreateAccount } from "./pages/CreateAccount.js";
import { ForgotPassword } from "./pages/ForgotPassword.js";
import { ResetPassword } from "./pages/ResetPassword.js";
import { Sessions } from "./pages/Sessions.js";

/**
 * Route map. Everything sits under `SiteShell` (masthead + footer) -
 * including the auth-gated pages, so a signed-out visitor redirected to
 * `/sign-in?next=...` and a signed-in one on `/bookings` see the same frame.
 * `RequireAuth` preserves the path it interrupted.
 *
 * The seven marketing pages are real now (C9) - see each page's own
 * comment on where its copy came from (not a canvas file; none was
 * reachable this session). "List your car" is not one of these pages -
 * every such link hands off straight to the merchant app's own landing
 * page (`lib/merchant-app.ts#merchantLandingUrl`), where listing a car
 * has always actually lived, rather than to an explainer page of its own.
 *
 * C8 (bookings, handover status, notifications, account) is also real now,
 * same not-pulled-from-canvas footing - `/bookings/:id` shows the handover's
 * *state* (a code is on its way / pickup or return is done), never the
 * code itself (only its hash exists server-side; the real code only ever
 * goes out by email). `/notifications` is a renter's own feed off
 * Migration B (`notifications.user_id`) - see docs/plans/customer-portal.md.
 * `Cruz Customer Portal.dc.html` (trips/account's own canvas file) still
 * hasn't been pulled this session; swap this for its copy once it is.
 */
const router = createBrowserRouter([
  {
    element: <SiteShell />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/browse", element: <Browse /> },
      { path: "/parts", element: <Parts /> },
      { path: "/services", element: <Services /> },
      { path: "/cars/:id", element: <CarDetail /> },
      { path: "/how-it-works", element: <HowItWorks /> },
      { path: "/how-we-protect-you", element: <HowWeProtectYou /> },
      { path: "/corporate", element: <Corporate /> },
      { path: "/about", element: <About /> },
      { path: "/help", element: <Help /> },
      { path: "/contact", element: <Contact /> },
      { path: "/legal", element: <Legal /> },
      // Not behind RequireAuth: a signed-out visitor lands here straight
      // from "Request these dates" and signs up inline as part of sending
      // the request - see Booking.tsx.
      { path: "/book/:id", element: <Booking /> },

      { path: "/sign-in", element: <SignIn /> },
      { path: "/create-account", element: <CreateAccount /> },
      { path: "/forgot-password", element: <ForgotPassword /> },
      { path: "/reset-password", element: <ResetPassword /> },

      {
        element: <RequireAuth />,
        children: [
          { path: "/services/towing", element: <Towing /> },
          { path: "/documents", element: <Documents /> },
          { path: "/bookings", element: <Trips /> },
          { path: "/bookings/:id", element: <TripDetail /> },
          { path: "/notifications", element: <Notifications /> },
          { path: "/account", element: <Sessions /> },
        ],
      },
    ],
  },
]);

export function App(): JSX.Element {
  return <RouterProvider router={router} />;
}
