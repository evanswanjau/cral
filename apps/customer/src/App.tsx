import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { SiteShell } from "./components/site/SiteShell.js";
import { Home } from "./pages/Home.js";
import { Browse } from "./pages/Browse.js";
import { CarDetail } from "./pages/CarDetail.js";
import { ComingSoon } from "./pages/ComingSoon.js";
import { AppLayout } from "./layouts/AppLayout.js";
import { RequireAuth } from "./components/RequireAuth.js";
import { Overview } from "./pages/Overview.js";
import { SignIn } from "./pages/SignIn.js";
import { CreateAccount } from "./pages/CreateAccount.js";
import { ForgotPassword } from "./pages/ForgotPassword.js";
import { ResetPassword } from "./pages/ResetPassword.js";
import { Sessions } from "./pages/Sessions.js";

/**
 * Route map. The public site sits under `SiteShell` (masthead + footer);
 * the authed area (trips, account) keeps the older `RequireAuth` +
 * `AppLayout` shell and now lives under `/account` rather than `/`.
 *
 * The seven marketing pages still resolve to a `ComingSoon` placeholder -
 * the home page links to them, so they must not hard-404. Each gets its
 * real screen in a later PR.
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
    ],
  },

  { path: "/sign-in", element: <SignIn /> },
  { path: "/create-account", element: <CreateAccount /> },
  { path: "/forgot-password", element: <ForgotPassword /> },
  { path: "/reset-password", element: <ResetPassword /> },

  {
    element: <RequireAuth />,
    children: [
      {
        path: "/account",
        element: <AppLayout />,
        children: [
          { index: true, element: <Overview /> },
          { path: "profile", element: <Sessions /> },
        ],
      },
    ],
  },
]);

export function App(): JSX.Element {
  return <RouterProvider router={router} />;
}
