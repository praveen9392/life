/**
 * The single HTTP client every feature API module wraps (no component calls
 * fetch/axios directly). Sends credentials with every request (httpOnly
 * auth cookies), attaches the CSRF header on mutating requests, and parses
 * the backend's `{"error": {...}}` envelope into a typed ApiError.
 */

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

// Override with VITE_API_BASE_URL in .env.local (gitignored) for other setups.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8001";

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  body?: unknown;
  signal?: AbortSignal;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {};

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  // Double-submit CSRF: echo the readable csrf_token cookie back as a header
  // on every mutating request (validated by backend middleware).
  if (method !== "GET") {
    const csrfToken = getCookie("csrf_token");
    if (csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      credentials: "include",
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    // Network-level failure (server down, offline) - distinct from HTTP errors.
    throw new ApiError(0, "NETWORK_ERROR", "Cannot reach the server. Check your connection.");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const data = (await response.json().catch(() => null)) as
    | { error?: { code?: string; message?: string; fields?: Record<string, string> } }
    | null;

  if (!response.ok) {
    const errorPayload = data?.error;
    throw new ApiError(
      response.status,
      errorPayload?.code ?? "UNKNOWN_ERROR",
      errorPayload?.message ?? "Something went wrong. Please try again.",
      errorPayload?.fields,
    );
  }

  return data as T;
}

export const httpClient = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
