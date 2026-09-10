import { QueryClient } from "@tanstack/react-query";

/**
 * The app's single QueryClient, kept in its own module rather than in
 * `main.tsx` so non-React code can reach it without importing the app
 * entry point (which would be a cycle). The catalog reads on the public
 * pages are anonymous; once trips/account land, `lib/auth.ts` should
 * clear this on a session change so per-user data does not outlive a
 * sign-out.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /**
       * Only retry what retrying can fix. The default is three attempts on
       * any failure, so a 404 or a 422 was tried three times before the
       * screen gave up - three times the wait to show an error that was
       * never going to change. A 401 is excluded too: `lib/api.ts` already
       * refreshes and retries once itself, and a second layer of retries on
       * top of that just stampedes the refresh endpoint.
       */
      retry: (failureCount, error) => {
        const status = (error as { status?: number }).status;
        if (status !== undefined && status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});
