import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { routes } from "./routes.js";

/** Route map: see routes.tsx. */
const router = createBrowserRouter(routes);

export function App(): JSX.Element {
  return <RouterProvider router={router} />;
}
