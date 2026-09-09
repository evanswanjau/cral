import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout.js";
import { RequireAdmin } from "./components/RequireAdmin.js";
import { SignIn } from "./pages/SignIn.js";
import { Placeholder } from "./pages/Placeholder.js";
import { Queue } from "./pages/vehicles/Queue.js";
import { Case } from "./pages/vehicles/Case.js";
import { Merchants } from "./pages/Merchants.js";
import { MerchantFile } from "./pages/MerchantFile.js";

/**
 * Vehicle review and the Merchants lens are built; the rest of the
 * console's nav (Dashboard, Bookings, Payouts, Invoicing, Disputes,
 * Communications, Settings) lands as later Phase-3 slices. Those routes
 * still resolve to a placeholder — so a direct URL or a profile-menu link
 * doesn't 404 — but `SideNav` only lists what's built, and `/` lands on
 * the vehicle-review queue.
 */
const router = createBrowserRouter([
  { path: "/sign-in", element: <SignIn /> },
  {
    element: <RequireAdmin />,
    children: [
      {
        path: "/",
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/vehicles" replace /> },
          { path: "dashboard", element: <Placeholder title="Dashboard" /> },
          { path: "vehicles", element: <Queue /> },
          { path: "vehicles/:vehicleId", element: <Case /> },
          { path: "merchants", element: <Merchants /> },
          { path: "merchants/:merchantId", element: <MerchantFile /> },
          { path: "bookings", element: <Placeholder title="Bookings" /> },
          { path: "payouts", element: <Placeholder title="Payouts" /> },
          { path: "invoicing", element: <Placeholder title="Invoicing" /> },
          { path: "disputes", element: <Placeholder title="Disputes" /> },
          { path: "communications", element: <Placeholder title="Communications" /> },
          { path: "settings", element: <Placeholder title="Settings" /> },
          { path: "settings/notifications", element: <Placeholder title="Notification preferences" /> },
          { path: "profile", element: <Placeholder title="Your profile" /> },
        ],
      },
    ],
  },
]);

export function App(): JSX.Element {
  return <RouterProvider router={router} />;
}
