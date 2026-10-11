import type {
  ApiErrorBody,
  DiscoveryView,
  Goal,
  IntroductionView,
  IntentView,
  PlaceInput,
  SessionView,
} from '../shared/contracts.js';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (!value || typeof value !== 'object' || !('error' in value)) return false;
  const error = value.error;
  return Boolean(
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string' &&
    'code' in error &&
    typeof error.code === 'string' &&
    'requestId' in error &&
    typeof error.requestId === 'string',
  );
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  csrfToken?: string;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 90_000);

  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.csrfToken) headers['X-CSRF-Token'] = options.csrfToken;

    const response = await fetch(`/api/v1${path}`, {
      method: options.method ?? 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });

    if (response.status === 204) return undefined as T;
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ApiError(
        'Third Place returned an unreadable response. The demo server may be unavailable. Please refresh and try again.',
        response.status,
        'INVALID_RESPONSE',
      );
    }
    if (!response.ok) {
      if (isApiErrorBody(data)) {
        throw new ApiError(data.error.message, response.status, data.error.code, data.error.requestId);
      }
      throw new ApiError(
        response.status === 401
          ? 'This demo session has expired. Reload the page to start a new fictional world.'
          : 'That request could not be completed. Please try again.',
        response.status,
        'REQUEST_FAILED',
      );
    }
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (timedOut) {
      throw new ApiError(
        'The server is taking longer than expected. Refresh saved activity before retrying, in case your request completed.',
        0,
        'TIMEOUT',
      );
    }
    if (controller.signal.aborted) throw error;
    throw new ApiError(
      'We couldn’t reach Third Place. Check your connection and make sure the demo server is running, then try again. No sample results are substituted.',
      0,
      'OFFLINE',
    );
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export interface AssistantToken {
  id: string;
  token: string;
  expiresAt: string;
}

export const api = {
  session: (signal?: AbortSignal) => request<SessionView>('/demo/session', { signal }),
  start: () => request<SessionView>('/demo/session', { method: 'POST', body: {} }),
  identity: (profileId: string, csrfToken: string) =>
    request<SessionView>('/demo/identity', { method: 'POST', body: { profileId }, csrfToken }),
  consent: (discoverable: boolean, introductionsAllowed: boolean, csrfToken: string) =>
    request<SessionView>('/me/consent', {
      method: 'PATCH',
      body: { discoverable, introductionsAllowed },
      csrfToken,
    }),
  intent: (message: string, location: PlaceInput, goal: Goal | undefined, csrfToken: string) =>
    request<IntentView>('/intents', {
      method: 'POST',
      body: {
        message,
        location,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        ...(goal ? { goal } : {}),
      },
      csrfToken,
    }),
  discover: (intentId: string, goal: Goal, csrfToken: string) =>
    request<DiscoveryView>('/discoveries', {
      method: 'POST',
      body: { intentId, goal },
      csrfToken,
    }),
  discoveries: (signal?: AbortSignal) =>
    request<{ discoveries: DiscoveryView[] }>('/discoveries', { signal }),
  introductions: (signal?: AbortSignal) =>
    request<{ requests: IntroductionView[] }>('/introductions', { signal }),
  introduce: (discoveryId: string, matchId: string, message: string, csrfToken: string) =>
    request<IntroductionView>('/introductions', {
      method: 'POST',
      body: { discoveryId, matchId, message },
      csrfToken,
    }),
  respond: (id: string, action: 'accept' | 'decline' | 'cancel', csrfToken: string) =>
    request<IntroductionView>(`/introductions/${encodeURIComponent(id)}/respond`, {
      method: 'POST',
      body: { action },
      csrfToken,
    }),
  token: (label: string, csrfToken: string) =>
    request<AssistantToken>('/assistant-tokens', {
      method: 'POST',
      body: { label },
      csrfToken,
    }),
  revokeToken: (id: string, csrfToken: string) =>
    request<void>(`/assistant-tokens/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      csrfToken,
    }),
};
