/**
 * Typed HTTP client for the unified REST envelope.
 *
 * Responsibilities:
 *  - unwrap `ApiResponseEnvelope<T>` and turn `success: false` into a typed
 *    `ApiError`, so callers only ever handle resolved data or one error type;
 *  - attach the in-memory access token and a correlation id on every request;
 *  - perform the refresh-on-401 exchange with a single-flight lock, so a burst
 *    of parallel 401s triggers exactly one rotation (the refresh token is
 *    single-use, so duplicate refreshes would destroy the session);
 *  - keep credentials on every request so the HttpOnly refresh cookie travels.
 *
 * The access token is never persisted. It lives in the Zustand store in memory
 * only, which is why a page reload must go through the refresh exchange.
 */

// Same-origin relative path by default: the Vite dev server proxies `/api` to
// the API, so the browser never makes a cross-origin request (no CORS, and
// cookies are first-party). Override with VITE_API_BASE_URL for absolute URLs.
const RAW_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';

/** Base URL without a trailing slash, e.g. `https://api.example.com/api/v1`. */
export const API_BASE_URL = RAW_BASE_URL.replace(/\/$/, '');

export class ApiError extends Error {
  public readonly statusCode: number;

  public readonly code: string;

  public readonly details: Record<string, unknown> | null;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details: Record<string, unknown> | null = null
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  /** True when the caller simply lacks the grant for this action. */
  get isForbidden(): boolean {
    return this.statusCode === 403;
  }

  get isUnauthorized(): boolean {
    return this.statusCode === 401;
  }
}

export interface ApiEnvelope<T> {
  success: boolean;
  statusCode: number;
  data: T | null;
  error: { code: string; message: string; details: Record<string, unknown> | null } | null;
  meta: {
    timestamp: string;
    requestId: string;
    pagination?: {
      totalRecords: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  };
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiRequestOptions {
  method?: HttpMethod;
  body?: unknown;
  /** Attaches the bearer token and participates in refresh-on-401. */
  authenticated?: boolean;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

type AccessTokenReader = () => string | null;
type AccessTokenWriter = (accessToken: string) => void;
type SessionTerminatedHandler = (reason: string) => void;

let readAccessToken: AccessTokenReader = () => null;
let writeAccessToken: AccessTokenWriter = () => undefined;
let onSessionTerminated: SessionTerminatedHandler = () => undefined;

/**
 * Wires the client to the session store. Called once from the auth provider so
 * the HTTP layer stays decoupled from React and from Zustand.
 */
export function configureApiClient(options: {
  getAccessToken: AccessTokenReader;
  setAccessToken: AccessTokenWriter;
  onSessionTerminated: SessionTerminatedHandler;
}): void {
  readAccessToken = options.getAccessToken;
  writeAccessToken = options.setAccessToken;
  onSessionTerminated = options.onSessionTerminated;
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Exchanges the refresh cookie for a new access token.
 *
 * Single-flight by construction: concurrent callers await the same promise, so
 * only one request hits `/auth/refresh`. That matters because the refresh token
 * is single-use — a second, parallel rotation would be treated as replay and
 * would terminate the session.
 */
export async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight !== null) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Request-Id': newRequestId() },
      });

      if (!response.ok) return false;

      const envelope = (await response.json()) as ApiEnvelope<{
        tokens: { accessToken: string; expiresIn: number };
      } | null>;
      const accessToken = envelope.data?.tokens.accessToken;
      if (!accessToken) return false;

      writeAccessToken(accessToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

function buildUrl(path: string, query?: ApiRequestOptions['query']): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const url = `${API_BASE_URL}${normalized}`;

  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    params.append(key, String(value));
  }

  const queryString = params.toString();
  return queryString.length > 0 ? `${url}?${queryString}` : url;
}

/**
 * Issues a request and returns the envelope's `data`.
 *
 * @throws {ApiError} for any non-success envelope or transport failure.
 */
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  return (await apiRequestEnvelope<T>(path, options)).data as T;
}

/** Like {@link apiRequest} but hands back the full envelope (pagination meta). */
export async function apiRequestEnvelope<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<ApiEnvelope<T>> {
  const { method = 'GET', body, authenticated = true, query, signal } = options;

  return send(path, method, body, authenticated, query, signal, true);
}

async function send(
  path: string,
  method: HttpMethod,
  body: unknown,
  authenticated: boolean,
  query: ApiRequestOptions['query'],
  signal: AbortSignal | undefined,
  allowRefresh: boolean
): Promise<ApiEnvelope<never>> {
  const headers: Record<string, string> = {
    'X-Request-Id': newRequestId(),
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (authenticated) {
    const token = readAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(buildUrl(path, query), {
    method,
    headers,
    // Required for the HttpOnly refresh cookie to travel with the request.
    credentials: 'include',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(signal ? { signal } : {}),
  });

  if (response.status === 401 && authenticated && allowRefresh) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return send(path, method, body, authenticated, query, signal, false);
    }
    onSessionTerminated('Session expired. Please sign in again.');
    throw new ApiError(401, 'SESSION_EXPIRED', 'Your session has ended.');
  }

  let envelope: ApiEnvelope<never>;
  try {
    envelope = (await response.json()) as ApiEnvelope<never>;
  } catch {
    throw new ApiError(
      response.status,
      'MALFORMED_RESPONSE',
      'The server returned a response that could not be parsed.',
      null
    );
  }

  if (!response.ok || !envelope.success || envelope.error !== null) {
    const error = envelope.error;
    throw new ApiError(
      response.status || envelope.statusCode,
      error?.code ?? 'REQUEST_FAILED',
      error?.message ?? 'The request could not be completed.',
      error?.details ?? null
    );
  }

  return envelope;
}