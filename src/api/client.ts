/**
 * Tiny `fetch` wrapper that mirrors the bits of the legacy `Communication.js`
 * we actually need in Phase 1: same-origin (via Vite proxy), credentials
 * included so the ASP.NET Identity cookie flows, JSON content type, and a
 * single error shape.
 *
 * Retry / progressive paging / cancel-password / `ContextId` correlation are
 * intentionally **not** ported in Phase 1. Add them when a feature needs them.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  body?: unknown,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  if (body !== undefined) headers.set('Content-Type', 'application/json');

  const response = await fetch(url, {
    ...init,
    method,
    headers,
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // Authentication redirects from the .NET backend (302 -> /Account/Login)
  // come through the Vite proxy as the login page HTML. fetch() follows
  // redirects by default, so a 200 with non-JSON content type is the signal.
  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');

  let parsed: unknown = undefined;
  if (isJson) {
    parsed = await response.json().catch(() => undefined);
  } else if (response.status !== 204) {
    parsed = await response.text().catch(() => undefined);
  }

  if (!response.ok) {
    const message =
      (isJson && parsed && typeof parsed === 'object' && 'message' in parsed
        ? String((parsed as { message?: unknown }).message)
        : undefined) ?? `${response.status} ${response.statusText}`;
    throw new ApiError(response.status, message, parsed);
  }

  return parsed as T;
}

export const api = {
  get: <T>(url: string, init?: RequestInit) => request<T>('GET', url, undefined, init),
  post: <T>(url: string, body?: unknown, init?: RequestInit) =>
    request<T>('POST', url, body, init),
  put: <T>(url: string, body?: unknown, init?: RequestInit) =>
    request<T>('PUT', url, body, init),
  delete: <T>(url: string, init?: RequestInit) => request<T>('DELETE', url, undefined, init),
};
