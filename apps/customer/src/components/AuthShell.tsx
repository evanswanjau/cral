import type { ReactNode } from "react";

export function AuthShell({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-lg font-semibold text-slate-900">{title}</h1>
        {children}
      </div>
    </div>
  );
}
