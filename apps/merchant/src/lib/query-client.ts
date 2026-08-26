import { QueryClient } from "@tanstack/react-query";

/**
 * The app's single QueryClient, kept in its own module rather than in
 * `main.tsx` so non-React code can reach it without importing the app
 * entry point (which would be a cycle).
 *
 * `lib/auth.ts` clears it on every session change — cached query data is
 * per-user and must not survive a sign-out or outlive one account into the
 * next one. See `setSession`.
 */
export const queryClient = new QueryClient();
