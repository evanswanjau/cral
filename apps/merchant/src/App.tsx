import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout.js";
import { RequireAuth } from "./components/RequireAuth.js";
import { RequireOnboarding } from "./components/RequireOnboarding.js";
import { Dashboard } from "./pages/Dashboard.js";
import { VehicleList } from "./pages/VehicleList.js";
import { VehicleDetail } from "./pages/VehicleDetail.js";
import { AddVehicle } from "./pages/AddVehicle.js";
import { DriverList } from "./pages/DriverList.js";
import { DriverDetail } from "./pages/DriverDetail.js";
import { AddDriver } from "./pages/AddDriver.js";
import { BookingList } from "./pages/BookingList.js";
import { BookingDetail } from "./pages/BookingDetail.js";
import { PayoutList } from "./pages/PayoutList.js";
import { PayoutDetail } from "./pages/PayoutDetail.js";
import { Notifications } from "./pages/Notifications.js";
import { Settings } from "./pages/Settings.js";
import { Onboarding } from "./pages/Onboarding.js";
import { SignIn } from "./pages/SignIn.js";
import { CreateAccount } from "./pages/CreateAccount.js";
import { ForgotPassword } from "./pages/ForgotPassword.js";
import { ResetPassword } from "./pages/ResetPassword.js";
import { JoinPage } from "./pages/join/JoinPage.js";
import { Assist } from "./pages/Assist.js";
import { rememberAgentCode } from "./lib/agent-link.js";

// A sales agent's sign-up link (`/join?a=<code>`, PR AG2) can land on any
// page, so the code is kept before routing, whatever the path.
rememberAgentCode(new URLSearchParams(window.location.search).get("a"));

const router = createBrowserRouter([
  { path: "/sign-in", element: <SignIn /> },
  { path: "/create-account", element: <CreateAccount /> },
  { path: "/forgot-password", element: <ForgotPassword /> },
  { path: "/reset-password", element: <ResetPassword /> },
  // Supplier pages, public like the landing at `/` (UI4).
  { path: "/join/:type", element: <JoinPage /> },
  // A sales agent's assist session lands here from CRAL Ops (PR AG3).
  { path: "/assist", element: <Assist /> },
  // An agent's personal link. The code is already kept above; the landing
  // shows every way to earn.
  { path: "/join", element: <Navigate to="/" replace /> },
  {
    element: <RequireAuth />,
    children: [
      // Standalone, not nested in AppLayout's nav shell - onboarding is a
      // focused first step, not part of the main dashboard.
      { path: "/onboarding", element: <Onboarding /> },
      {
        // The portal is gated on a finished onboarding - no vehicle, no
        // portal; you get returned to the step you stopped at.
        element: <RequireOnboarding />,
        children: [
          {
            path: "/",
            element: <AppLayout />,
            children: [
              { index: true, element: <Dashboard /> },
              { path: "vehicles", element: <VehicleList /> },
              { path: "vehicles/new", element: <AddVehicle /> },
              { path: "vehicles/:vehicleId", element: <VehicleDetail /> },
              { path: "drivers", element: <DriverList /> },
              { path: "drivers/new", element: <AddDriver /> },
              { path: "drivers/:driverId", element: <DriverDetail /> },
              { path: "bookings", element: <BookingList /> },
              { path: "bookings/:bookingId", element: <BookingDetail /> },
              { path: "payouts", element: <PayoutList /> },
              { path: "payouts/:payoutRunId", element: <PayoutDetail /> },
              { path: "notifications", element: <Notifications /> },
              { path: "settings", element: <Settings /> },
              // The two slices that shipped before the shell keep working.
              { path: "settings/security", element: <Navigate to="/settings?tab=security" replace /> },
              {
                path: "settings/notifications",
                element: <Navigate to="/settings?tab=notifications" replace />,
              },
            ],
          },
        ],
      },
    ],
  },
]);

export function App(): JSX.Element {
  return <RouterProvider router={router} />;
}
