import { Link } from "react-router-dom";
import { BrandPanel } from "../components/BrandPanel.js";

/** Placeholder for screens not in scope yet — keeps links from Sign in from breaking the router. */
export function NotBuiltYet({ title }: { title: string }): JSX.Element {
  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <BrandPanel />
      <div className="flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold text-neutral-900">{title}</h1>
          <p className="mt-2 text-sm text-neutral-600">This screen isn't built yet.</p>
          <Link to="/sign-in" className="mt-6 inline-block text-sm font-semibold text-cruz-blue hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
