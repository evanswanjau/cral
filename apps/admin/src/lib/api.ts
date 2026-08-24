const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? `Request to ${path} failed with ${res.status}`);
  }
  return res.json() as Promise<T>;
}
