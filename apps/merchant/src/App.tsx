import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout.js";
import { RequireAuth } from "./components/RequireAuth.js";
import { RequireOnboarding } from "./components/RequireOnboarding.js";
import { VehicleList } from "./pages/VehicleList.js";
import { VehicleDetail } from "./pages/VehicleDetail.js";
import { AddVehicle } from "./pages/AddVehicle.js";
import { Onboarding } from "./pages/Onboarding.js";
import { SignIn } from "./pages/SignIn.js";
import { CreateAccount } from "./pages/CreateAccount.js";
import { ForgotPassword } from "./pages/ForgotPassword.js";
import { ResetPassword } from "./pages/ResetPassword.js";

const router = createBrowserRouter([
  { path: "/sign-in", element: <SignIn /> },
  { path: "/create-account", element: <CreateAccount /> },
  { path: "/forgot-password", element: <ForgotPassword /> },
  { path: "/reset-password", element: <ResetPassword /> },
  {
    element: <RequireAuth />,
    children: [
      // Standalone, not nested in AppLayout's nav shell — onboarding is a
      // focused first step, not part of the main dashboard.
      { path: "/onboarding", element: <Onboarding /> },
      {
        // The portal is gated on a finished onboarding — no vehicle, no
        // portal; you get returned to the step you stopped at.
        element: <RequireOnboarding />,
        children: [
          {
            path: "/",
            element: <AppLayout />,
            children: [
              { index: true, element: <Navigate to="/vehicles" replace /> },
              { path: "vehicles", element: <VehicleList /> },
              { path: "vehicles/new", element: <AddVehicle /> },
              { path: "vehicles/:vehicleId", element: <VehicleDetail /> },
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
