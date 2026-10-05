import type { ApiResponse, AuthResponseDto } from '../types/auth';

/**
 * Robust HTTP client with JWT Bearer authentication, automatic 401 refresh token flow,
 * and unified error parsing for ASP.NET Core Clean Architecture Web API backend.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly errors?: string[];

  constructor(status: number, message: string, body: unknown, errors?: string[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.errors = errors;
  }
}

const ACCESS_TOKEN_KEY = 'saas.accessToken';
const REFRESH_TOKEN_KEY = 'saas.refreshToken';
const AUTH_STORE_KEY = 'saas.authStore';

export const tokenStorage = {
  getAccessToken(): string | null {
    return (
      window.localStorage.getItem(ACCESS_TOKEN_KEY) ||
      window.sessionStorage.getItem(ACCESS_TOKEN_KEY)
    );
  },

  getRefreshToken(): string | null {
    return (
      window.localStorage.getItem(REFRESH_TOKEN_KEY) ||
      window.sessionStorage.getItem(REFRESH_TOKEN_KEY)
    );
  },

  setAuth(accessToken: string, refreshToken: string, remember: boolean = true) {
    this.clearAuth();
    const storage = remember ? window.localStorage : window.sessionStorage;
    storage.setItem(ACCESS_TOKEN_KEY, accessToken);
    storage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    storage.setItem(AUTH_STORE_KEY, remember ? 'local' : 'session');
  },

  clearAuth() {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    window.localStorage.removeItem(AUTH_STORE_KEY);
    window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    window.sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    window.sessionStorage.removeItem(AUTH_STORE_KEY);
  },
};

let isRefreshing = false;
let refreshSubscribers: ((token: string | null) => void)[] = [];

function onTokenRefreshed(newToken: string | null) {
  refreshSubscribers.forEach((callback) => callback(newToken));
  refreshSubscribers = [];
}

function addRefreshSubscriber(callback: (token: string | null) => void) {
  refreshSubscribers.push(callback);
}

async function tryRefreshToken(): Promise<string | null> {
  const currentRefreshToken = tokenStorage.getRefreshToken();
  if (!currentRefreshToken) return null;

  try {
    const response = await fetch('/api/auth/refresh-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ refreshToken: currentRefreshToken }),
    });

    if (!response.ok) {
      tokenStorage.clearAuth();
      return null;
    }

    const payload = (await response.json()) as ApiResponse<AuthResponseDto>;
    if (payload?.success && payload?.data?.accessToken && payload?.data?.refreshToken) {
      const isRemember = window.localStorage.getItem(AUTH_STORE_KEY) === 'local';
      tokenStorage.setAuth(payload.data.accessToken, payload.data.refreshToken, isRemember);
      return payload.data.accessToken;
    }

    tokenStorage.clearAuth();
    return null;
  } catch {
    tokenStorage.clearAuth();
    return null;
  }
}

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  body?: unknown,
  init?: RequestInit,
  isRetry: boolean = false,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  if (body !== undefined) headers.set('Content-Type', 'application/json');

  const accessToken = tokenStorage.getAccessToken();
  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const response = await fetch(url, {
    ...init,
    method,
    headers,
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // Intercept 401 for automatic JWT token refreshing
  if (
    response.status === 401 &&
    !isRetry &&
    !url.includes('/api/auth/login') &&
    !url.includes('/api/auth/refresh-token')
  ) {
    if (!isRefreshing) {
      isRefreshing = true;
      const newToken = await tryRefreshToken();
      isRefreshing = false;
      onTokenRefreshed(newToken);

      if (newToken) {
        return request<T>(method, url, body, init, true);
      }
    } else {
      const newToken = await new Promise<string | null>((resolve) => {
        addRefreshSubscriber(resolve);
      });

      if (newToken) {
        return request<T>(method, url, body, init, true);
      }
    }
  }

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');

  let parsed: unknown = undefined;
  if (isJson) {
    parsed = await response.json().catch(() => undefined);
  } else if (response.status !== 204) {
    parsed = await response.text().catch(() => undefined);
  }

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    let errors: string[] | undefined = undefined;

    if (isJson && parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      if (typeof obj.message === 'string') message = obj.message;
      if (Array.isArray(obj.errors)) errors = obj.errors.map(String);
    }

    throw new ApiError(response.status, message, parsed, errors);
  }

  return parsed as T;
}

/**
 * Unwrap ApiResponse<T> or return raw response if not wrapped.
 */
function unwrapResponse<T>(res: unknown): T {
  if (res && typeof res === 'object' && 'success' in res && 'data' in res) {
    const apiRes = res as ApiResponse<T>;
    if (!apiRes.success && apiRes.message) {
      throw new ApiError(400, apiRes.message, apiRes, apiRes.errors);
    }
    return apiRes.data as T;
  }
  return res as T;
}

export const api = {
  get: async <T>(url: string, init?: RequestInit): Promise<T> => {
    const res = await request<unknown>('GET', url, undefined, init);
    return unwrapResponse<T>(res);
  },
  post: async <T>(url: string, body?: unknown, init?: RequestInit): Promise<T> => {
    const res = await request<unknown>('POST', url, body, init);
    return unwrapResponse<T>(res);
  },
  put: async <T>(url: string, body?: unknown, init?: RequestInit): Promise<T> => {
    const res = await request<unknown>('PUT', url, body, init);
    return unwrapResponse<T>(res);
  },
  delete: async <T>(url: string, init?: RequestInit): Promise<T> => {
    const res = await request<unknown>('DELETE', url, undefined, init);
    return unwrapResponse<T>(res);
  },

  // Raw wrapped callers if access to full ApiResponse structure is desired
  getWrapped: <T>(url: string, init?: RequestInit) =>
    request<ApiResponse<T>>('GET', url, undefined, init),
  postWrapped: <T>(url: string, body?: unknown, init?: RequestInit) =>
    request<ApiResponse<T>>('POST', url, body, init),
  putWrapped: <T>(url: string, body?: unknown, init?: RequestInit) =>
    request<ApiResponse<T>>('PUT', url, body, init),
  deleteWrapped: <T>(url: string, init?: RequestInit) =>
    request<ApiResponse<T>>('DELETE', url, undefined, init),
};
