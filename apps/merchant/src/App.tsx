import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout.js";
import { RequireAuth } from "./components/RequireAuth.js";
import { Overview } from "./pages/Overview.js";
import { SignIn } from "./pages/SignIn.js";
import { NotBuiltYet } from "./pages/NotBuiltYet.js";

const router = createBrowserRouter([
  { path: "/sign-in", element: <SignIn /> },
  { path: "/create-account", element: <NotBuiltYet title="Create your account" /> },
  { path: "/forgot-password", element: <NotBuiltYet title="Forgot your password?" /> },
  {
    element: <RequireAuth />,
    children: [
      {
        path: "/",
        element: <AppLayout />,
        children: [{ index: true, element: <Overview /> }],
      },
    ],
  },
]);

export function App(): JSX.Element {
  return <RouterProvider router={router} />;
}
