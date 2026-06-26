import type { MockedFunction } from 'vitest'
import type { ApimoRequestContext } from './mutator'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiBadRequestError,
  ApiConfigurationError,
  ApiForbiddenError,
  ApiHttpError,
  ApimoError,
  ApiNotFoundError,
  ApiRateLimitError,
  ApiRetryExhaustedError,
  ApiServerError,
  ApiUnauthorizedError,
} from '../errors'
import { apimoRequestContext } from './context'
import { customFetch, retryInternals } from './mutator'

const mockFetch = vi.fn() as MockedFunction<typeof fetch>

interface ResponseMockerConfig {
  ok?: boolean
  status?: number
  json?: () => any
}

function makeMockResponse(config?: ResponseMockerConfig): Response {
  return {
    ok: config?.ok ?? true,
    status: config?.status ?? 200,
    json: config?.json ? vi.fn().mockResolvedValue(config.json()) : vi.fn().mockResolvedValue({}),
    text: vi.fn(),
    headers: new Headers(),
    statusText: 'OK',
    url: '',
    redirected: false,
    type: 'basic',
    body: null,
    bodyUsed: false,
    clone: vi.fn(),
    arrayBuffer: vi.fn(),
    blob: vi.fn(),
    formData: vi.fn(),
  } as unknown as Response
}

const AUTH = `Basic ${btoa('0:TOKEN')}`

/** A limiter stub that schedules immediately, so tests don't wait on Bottleneck. */
const passthroughLimiter = {
  schedule: <T>(fn: () => Promise<T>) => fn(),
} as unknown as ApimoRequestContext['limiter']

function makeContext(overrides?: Partial<ApimoRequestContext>): ApimoRequestContext {
  return {
    baseUrl: 'https://api.apimo.pro',
    authHeader: AUTH,
    limiter: passthroughLimiter,
    retry: { attempts: 1, initialDelayMs: 0, backoff: 'fixed' },
    ...overrides,
  }
}

/** Runs `customFetch` inside a request context. */
function run<T = unknown>(url: string, options: RequestInit = {}, ctx?: Partial<ApimoRequestContext>): Promise<T> {
  return apimoRequestContext.run(makeContext(ctx), () => customFetch<T>(url, options))
}

describe('customFetch (mutator)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockResolvedValue(makeMockResponse())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('throws ApiConfigurationError when called outside a request context', async () => {
    await expect(customFetch('/agencies', { method: 'GET' })).rejects.toThrowError(ApiConfigurationError)
  })

  it('resolves the URL against the base URL and injects auth headers', async () => {
    await run('/agencies', { method: 'GET' })

    expect(mockFetch).toHaveBeenCalledExactlyOnceWith(
      'https://api.apimo.pro/agencies',
      {
        method: 'GET',
        headers: {
          Authorization: AUTH,
          Accept: 'application/json',
        },
      },
    )
  })

  it('merges caller-provided headers with the auth headers', async () => {
    await run('/agencies', { method: 'GET', headers: { 'X-Custom': 'value' } })

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.apimo.pro/agencies',
      {
        method: 'GET',
        headers: {
          'Authorization': AUTH,
          'Accept': 'application/json',
          'X-Custom': 'value',
        },
      },
    )
  })

  it('returns the {data, status, headers} envelope on success', async () => {
    mockFetch.mockResolvedValue(makeMockResponse({ json: () => ({ ok: true }) }))

    const result = await run<{ data: { ok: boolean }, status: number }>('/agencies')

    expect(result.status).toBe(200)
    expect(result.data).toEqual({ ok: true })
  })

  it('schedules the request through the limiter', async () => {
    const schedule = vi.fn(<T>(fn: () => Promise<T>) => fn())
    await run('/agencies', {}, { limiter: { schedule } as unknown as ApimoRequestContext['limiter'] })

    expect(schedule).toHaveBeenCalledOnce()
  })

  describe('hTTP error mapping', () => {
    const nonRetryable = [
      { status: 400, ErrorClass: ApiBadRequestError },
      { status: 401, ErrorClass: ApiUnauthorizedError },
      { status: 403, ErrorClass: ApiForbiddenError },
      { status: 404, ErrorClass: ApiNotFoundError },
    ] as const

    for (const { status, ErrorClass } of nonRetryable) {
      it(`throws ${ErrorClass.name} for HTTP ${status} (no retry)`, async () => {
        mockFetch.mockResolvedValue(makeMockResponse({ ok: false, status, json: () => null }))
        const error = await run('/path', {}, { retry: { attempts: 3, initialDelayMs: 0, backoff: 'fixed' } }).catch(e => e)
        expect(error).toBeInstanceOf(ErrorClass)
        expect(error).toBeInstanceOf(ApiHttpError)
        expect(error).toBeInstanceOf(ApimoError)
        expect(mockFetch).toHaveBeenCalledTimes(1)
      })
    }

    const retryable = [
      { status: 429, ErrorClass: ApiRateLimitError },
      { status: 500, ErrorClass: ApiServerError },
      { status: 503, ErrorClass: ApiServerError },
    ] as const

    for (const { status, ErrorClass } of retryable) {
      it(`wraps ${ErrorClass.name} for HTTP ${status} in ApiRetryExhaustedError`, async () => {
        mockFetch.mockResolvedValue(makeMockResponse({ ok: false, status, json: () => null }))
        const error = await run('/path').catch(e => e)
        expect(error).toBeInstanceOf(ApiRetryExhaustedError)
        expect((error as ApiRetryExhaustedError).cause).toBeInstanceOf(ErrorClass)
      })
    }

    it('attaches the response body to the error when available', async () => {
      const body = { error: 'Not found', code: 42 }
      mockFetch.mockResolvedValue(makeMockResponse({ ok: false, status: 404, json: () => body }))
      const error = await run('/path').catch(e => e)
      expect((error as ApiNotFoundError).responseBody).toEqual(body)
    })

    it('attaches the request URL to the error', async () => {
      mockFetch.mockResolvedValue(makeMockResponse({ ok: false, status: 401, json: () => null }))
      const error = await run('/agencies').catch(e => e)
      expect((error as ApiUnauthorizedError).url).toContain('agencies')
    })

    it('handles a non-JSON error body gracefully', async () => {
      mockFetch.mockResolvedValue({
        ...makeMockResponse({ ok: false, status: 500 }),
        json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
      } as unknown as Response)
      const error = await run('/path').catch(e => e)
      const cause = (error as ApiRetryExhaustedError).cause
      expect(cause).toBeInstanceOf(ApiServerError)
      expect((cause as ApiServerError).responseBody).toBeUndefined()
    })

    it('throws a generic ApiHttpError for unmapped non-retryable status codes', async () => {
      mockFetch.mockResolvedValue(makeMockResponse({ ok: false, status: 418, json: () => null }))
      const error = await run('/path').catch(e => e)
      expect(error).toBeInstanceOf(ApiHttpError)
      expect((error as ApiHttpError).statusCode).toBe(418)
    })
  })

  describe('retry behaviour', () => {
    const retry3 = { retry: { attempts: 3, initialDelayMs: 0, backoff: 'fixed' as const } }

    it('retries the configured number of times on a 500', async () => {
      mockFetch.mockResolvedValue(makeMockResponse({ ok: false, status: 500, json: () => null }))
      await run('/path', {}, retry3).catch(() => {})
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('retries on 429', async () => {
      mockFetch.mockResolvedValue(makeMockResponse({ ok: false, status: 429, json: () => null }))
      await run('/path', {}, retry3).catch(() => {})
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('does NOT retry on 400', async () => {
      mockFetch.mockResolvedValue(makeMockResponse({ ok: false, status: 400, json: () => null }))
      await run('/path', {}, retry3).catch(() => {})
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('retries on network-level errors (fetch rejection)', async () => {
      mockFetch
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce(makeMockResponse({ ok: true, status: 200, json: () => ({ ok: true }) }))

      const result = await run<{ data: { ok: boolean } }>('/path', {}, retry3)
      expect(result.data).toEqual({ ok: true })
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('succeeds on a later attempt after transient failures', async () => {
      mockFetch
        .mockResolvedValueOnce(makeMockResponse({ ok: false, status: 503, json: () => null }))
        .mockResolvedValueOnce(makeMockResponse({ ok: true, status: 200, json: () => ({ value: 42 }) }))

      const result = await run<{ data: { value: number } }>('/path', {}, retry3)
      expect(result.data).toEqual({ value: 42 })
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('carries the attempts count on ApiRetryExhaustedError', async () => {
      mockFetch.mockResolvedValue(makeMockResponse({ ok: false, status: 500, json: () => null }))
      const error = await run('/path', {}, retry3).catch(e => e)
      expect((error as ApiRetryExhaustedError).attempts).toBe(3)
    })

    it.each([
      { backoff: 'exponential' as const, expected: [100, 200] },
      { backoff: 'linear' as const, expected: [100, 200] },
      { backoff: 'fixed' as const, expected: [100, 100] },
    ])('applies $backoff backoff delays', async ({ backoff, expected }) => {
      const sleepSpy = vi.spyOn(retryInternals, 'sleep').mockResolvedValue(undefined)
      mockFetch.mockResolvedValue(makeMockResponse({ ok: false, status: 500, json: () => null }))

      await run('/path', {}, { retry: { attempts: 3, initialDelayMs: 100, backoff } }).catch(() => {})

      expect(sleepSpy).toHaveBeenCalledTimes(2)
      expect(sleepSpy).toHaveBeenNthCalledWith(1, expected[0])
      expect(sleepSpy).toHaveBeenNthCalledWith(2, expected[1])
      sleepSpy.mockRestore()
    })
  })
})
