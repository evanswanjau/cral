import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout.js";
import { RequireAdmin } from "./components/RequireAdmin.js";
import { SignIn } from "./pages/SignIn.js";
import { Placeholder } from "./pages/Placeholder.js";
import { Queue } from "./pages/vehicles/Queue.js";
import { Case } from "./pages/vehicles/Case.js";
import { Merchants } from "./pages/Merchants.js";
import { MerchantFile } from "./pages/MerchantFile.js";
import { Renters } from "./pages/Renters.js";
import { RenterFile } from "./pages/RenterFile.js";
import { Bookings } from "./pages/Bookings.js";
import { BookingDetail } from "./pages/BookingDetail.js";
import { Settings } from "./pages/Settings.js";
import { Communications } from "./pages/Communications.js";
import { Queue as ServicesQueue } from "./pages/services/Queue.js";
import { Case as ServiceCase } from "./pages/services/Case.js";

/**
 * Vehicle review, the Merchants lens, the Renters queue, the Bookings
 * directory, Settings (with its Team tab), and Communications are built;
 * the rest of the console's nav (Dashboard, Payouts, Invoicing, Disputes)
 * lands as later Phase-3 slices. Those routes still resolve to a
 * placeholder — so a direct URL or a profile-menu link doesn't 404 — but
 * `SideNav` only lists what's built, and `/` lands on the vehicle-review
 * queue. `/team` redirects into `/settings?tab=team` for the bookmark that
 * briefly existed while Team was its own top-level route.
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
          { path: "renters", element: <Renters /> },
          { path: "renters/:userId", element: <RenterFile /> },
          { path: "bookings", element: <Bookings /> },
          { path: "bookings/:id", element: <BookingDetail /> },
          { path: "services", element: <ServicesQueue /> },
          { path: "services/:id", element: <ServiceCase /> },
          { path: "payouts", element: <Placeholder title="Payouts" /> },
          { path: "invoicing", element: <Placeholder title="Invoicing" /> },
          { path: "disputes", element: <Placeholder title="Disputes" /> },
          { path: "communications", element: <Communications /> },
          { path: "communications/templates", element: <Communications /> },
          { path: "communications/logs", element: <Communications /> },
          { path: "team", element: <Navigate to="/settings?tab=team" replace /> },
          { path: "settings", element: <Settings /> },
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
