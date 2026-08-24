import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout.js";
import { Overview } from "./pages/Overview.js";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [{ index: true, element: <Overview /> }],
  },
]);

export function App(): JSX.Element {
  return <RouterProvider router={router} />;
}
