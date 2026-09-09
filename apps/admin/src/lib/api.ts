import { getAccessToken, getRefreshToken, setSession, updateTokens } from "./auth.js";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field: string | undefined;

  constructor(status: number, code: string, message: string, field?: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "DELETE" | "PATCH" | "PUT";
  body?: unknown;
  /** Multipart body - mutually exclusive with `body`. */
  formData?: FormData;
  /** Attach the ops token, and transparently refresh-and-retry once on a 401. Default true. */
  auth?: boolean;
  /** Read a successful response as a Blob instead of JSON. */
  blob?: boolean;
  /** Extra headers merged in - e.g. Idempotency-Key. */
  headers?: Record<string, string>;
}

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) {
        setSession(null);
        return false;
      }
      updateTokens(await res.json());
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function request<T>(path: string, options: RequestOptions, isRetry = false): Promise<T> {
  const { method = "GET", body, formData, auth = true, blob = false } = options;
  const headers: Record<string, string> = { ...options.headers };
  if (formData === undefined && body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = getAccessToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    ...(formData !== undefined
      ? { body: formData }
      : body !== undefined
        ? { body: JSON.stringify(body) }
        : {}),
  });

  if (res.status === 401 && auth && !isRetry) {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, options, true);
  }

  if (res.status === 204) return undefined as T;

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const error = payload?.error;
    throw new ApiClientError(
      res.status,
      error?.code ?? "unknown_error",
      error?.message ?? `Request to ${path} failed with ${res.status}`,
      error?.field,
    );
  }

  if (blob) return (await res.blob()) as T;
  return (await res.json().catch(() => null)) as T;
}

export const apiGet = <T>(path: string, options: Omit<RequestOptions, "method" | "body"> = {}) =>
  request<T>(path, { ...options, method: "GET" });

export const apiPost = <T>(path: string, body?: unknown, options: Omit<RequestOptions, "method" | "body"> = {}) =>
  request<T>(path, { ...options, method: "POST", body });

export const apiPatch = <T>(path: string, body?: unknown, options: Omit<RequestOptions, "method" | "body"> = {}) =>
  request<T>(path, { ...options, method: "PATCH", body });

export const apiDelete = <T>(path: string, body?: unknown, options: Omit<RequestOptions, "method" | "body"> = {}) =>
  request<T>(path, { ...options, method: "DELETE", body });

export const apiBlob = (path: string, options: Omit<RequestOptions, "method" | "body" | "blob"> = {}) =>
  request<Blob>(path, { ...options, method: "GET", blob: true });
