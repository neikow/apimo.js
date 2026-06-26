import type Bottleneck from 'bottleneck'
import {
  ApiConfigurationError,
  ApiRetryExhaustedError,
  isRetryable,
  throwForStatus,
} from '../errors'
import { apimoRequestContext } from './context'

/**
 * Back-off strategy applied between retry attempts.
 * - `exponential` — delay doubles on every retry (200 → 400 → 800 …)
 * - `linear`      — delay increases by `initialDelayMs` each time (200 → 400 → 600 …)
 * - `fixed`       — the same delay is used for every retry
 */
export type BackoffStrategy = 'exponential' | 'linear' | 'fixed'

export interface RetryConfig {
  /** Maximum total number of attempts (1 = no retries). */
  attempts: number
  /** Delay in milliseconds before the first retry. */
  initialDelayMs: number
  /** Back-off strategy applied between attempts. */
  backoff: BackoffStrategy
}

/**
 * Per-request configuration carried through {@link apimoRequestContext}.
 *
 * The orval-generated client functions are plain module-level functions with no
 * notion of credentials or instance state. The `Apimo` client runs each call
 * inside an `AsyncLocalStorage` scope so this context is available to the
 * mutator below — which lets multiple `Apimo` instances with different
 * credentials coexist without a shared global.
 */
export interface ApimoRequestContext {
  /** Absolute base URL, e.g. `https://api.apimo.pro`. */
  baseUrl: string
  /** Pre-computed `Basic <base64>` authorization header value. */
  authHeader: string
  /** Shared Bottleneck limiter enforcing the API rate limit. */
  limiter: Bottleneck
  /** Retry/back-off configuration. */
  retry: RetryConfig
}

/** The shape every orval-generated `fetch` client function resolves to. */
export interface FetchResponse<T> {
  data: T
  status: number
  headers: Headers
}

/** Calculates the delay before the next retry attempt (1-based attempt index). */
export function retryDelayMs(attempt: number, initialDelayMs: number, backoff: BackoffStrategy): number {
  switch (backoff) {
    case 'exponential': return initialDelayMs * 2 ** (attempt - 1)
    case 'linear': return initialDelayMs * attempt
    case 'fixed': return initialDelayMs
  }
}

/**
 * Indirection object so tests can stub the sleep between retries without fake
 * timers (mirrors the old `Apimo.prototype.sleep` spy point).
 */
export const retryInternals = {
  sleep: (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms)),
}

/**
 * Custom mutator used by every orval-generated client function.
 *
 * It centralises all HTTP concerns that the generated code is deliberately
 * agnostic about:
 *  - resolves the request URL against the configured base URL,
 *  - injects HTTP Basic authentication,
 *  - schedules the request through the shared Bottleneck limiter,
 *  - retries transient failures (429 / 5xx / network) with back-off,
 *  - maps non-2xx responses onto the typed `Api*Error` hierarchy.
 *
 * @throws {ApiConfigurationError} when called outside of an `Apimo` request scope.
 * @throws {ApiHttpError} (or a subclass) for non-retryable HTTP errors.
 * @throws {ApiRetryExhaustedError} when all retry attempts fail.
 */
export async function customFetch<T>(url: string, options: RequestInit): Promise<T> {
  const context = apimoRequestContext.getStore()
  if (!context) {
    throw new ApiConfigurationError(
      'An API call was made outside of an Apimo request context. Use the methods on an `Apimo` instance instead of calling the generated client directly.',
    )
  }

  const { baseUrl, authHeader, limiter, retry } = context
  const requestUrl = new URL(url, baseUrl).toString()
  const init: RequestInit = {
    ...options,
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
      ...options.headers,
    },
  }

  const { attempts, initialDelayMs, backoff } = retry
  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await limiter.schedule(() => fetch(requestUrl, init))

      if (!response.ok) {
        let responseBody: unknown
        try {
          responseBody = await response.json()
        }
        catch {
          // The body wasn't JSON — leave responseBody as undefined.
        }
        throwForStatus(response.status, requestUrl, responseBody)
      }

      const data = (await response.json()) as T extends FetchResponse<infer D> ? D : unknown
      return { data, status: response.status, headers: response.headers } as T
    }
    catch (error) {
      lastError = error

      if (!isRetryable(error)) {
        // Non-transient errors (4xx, etc.) — propagate immediately.
        throw error
      }
      if (attempt >= attempts) {
        break
      }

      await retryInternals.sleep(retryDelayMs(attempt, initialDelayMs, backoff))
    }
  }

  throw new ApiRetryExhaustedError(attempts, lastError)
}
