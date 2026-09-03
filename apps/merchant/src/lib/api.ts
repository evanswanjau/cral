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
  /** Multipart body - mutually exclusive with `body`. Skips the JSON Content-Type header so the browser sets its own multipart boundary. */
  formData?: FormData;
  /** Attach the access token, and transparently refresh-and-retry once on a 401. Default true. */
  auth?: boolean;
  /** Read a successful response as a Blob instead of JSON. Errors are still parsed as the JSON envelope. */
  blob?: boolean;
  /** Extra headers merged in on top of Content-Type/Authorization - e.g. Idempotency-Key. */
  headers?: Record<string, string>;
}

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/token/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) {
        setSession(null);
        return false;
      }
      const tokens = await res.json();
      updateTokens(tokens);
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
  // formData: no Content-Type here - the browser sets its own multipart
  // boundary, which it can only do if this fetch doesn't specify one.
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

  // Errors are always the JSON envelope, even from endpoints that return
  // binary on success - so decide on `res.ok` first, not on `blob`.
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

export const apiPut = <T>(path: string, body?: unknown, options: Omit<RequestOptions, "method" | "body"> = {}) =>
  request<T>(path, { ...options, method: "PUT", body });

export const apiDelete = <T>(path: string, body?: unknown, options: Omit<RequestOptions, "method" | "body"> = {}) =>
  request<T>(path, { ...options, method: "DELETE", body });

export const apiUpload = <T>(path: string, formData: FormData, options: Omit<RequestOptions, "method" | "body" | "formData"> = {}) =>
  request<T>(path, { ...options, method: "POST", formData });

/**
 * GETs a binary response as a Blob. Goes through `request()` rather than
 * calling fetch directly so it keeps the bearer header and the shared
 * 401-refresh-and-retry - several of these fire at once when a page of
 * photos loads, and `refreshInFlight` is what stops them stampeding the
 * refresh endpoint.
 */
export const apiBlob = (path: string, options: Omit<RequestOptions, "method" | "body" | "blob"> = {}) =>
  request<Blob>(path, { ...options, method: "GET", blob: true });
