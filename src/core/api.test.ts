import type { MockedFunction } from 'vitest'
import type { CatalogName } from '../consts/catalogs'
import type { ApiCulture } from '../consts/languages'
import { afterEach, beforeEach, it as defaultIt, describe, expect, vi } from 'vitest'
import { z } from 'zod'
import {
  ApiBadRequestError,
  ApiConfigurationError,
  ApiForbiddenError,
  ApiHttpError,
  ApimoError,
  ApiNotFoundError,
  ApiRateLimitError,
  ApiResponseValidationError,
  ApiServerError,
  ApiUnauthorizedError,
} from '../errors'
import { DummyCache } from '../services/storage/dummy.cache'
import { MemoryCache } from '../services/storage/memory.cache'
import { Apimo, DEFAULT_BASE_URL } from './api'

// Mock fetch globally
const mockFetch = vi.fn() as MockedFunction<typeof fetch>

interface ResponseMockerConfig {
  ok?: boolean
  status?: number
  json?: () => any
}

type ResponseMocker = (config?: ResponseMockerConfig) => void

const PROVIDER = '0'
const TOKEN = 'TOKEN'

const BasicAuthHeaders = {
  Authorization: `Basic ${btoa(`${PROVIDER}:${TOKEN}`)}`,
}

const it = defaultIt.extend<{
  api: Apimo
  mockResponse: ResponseMocker
}>({
  // eslint-disable-next-line no-empty-pattern
  api: async ({}, use) => {
    let api: Apimo | null = new Apimo('0', 'TOKEN', {
      catalogs: {
        transform: {
          active: false,
        },
      },
    })
    await use(api)
    api = null
  },
  // eslint-disable-next-line no-empty-pattern
  mockResponse: async ({}, use) => {
    const mockResponse: ResponseMocker = (config) => {
      mockFetch.mockResolvedValue({
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
      } as unknown as Response)
    }
    await use(mockResponse)
  },
})

describe('api', () => {
  let mockResponse: Response

  beforeEach(() => {
    // Mock global fetch
    vi.stubGlobal('fetch', mockFetch)

    // Create a mock response object
    mockResponse = {
      ok: true,
      status: 200,
      json: vi.fn(),
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

    mockFetch.mockResolvedValue(mockResponse)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('should accept a provider, a token and a base config', ({ api }) => {
      expect(api).toBeInstanceOf(Apimo)
    })

    it('should use default config when no additional config provided', ({ api }) => {
      expect(api.config).toStrictEqual({
        baseUrl: DEFAULT_BASE_URL,
        culture: 'en' as ApiCulture,
        catalogs: {
          cache: {
            active: true,
            adapter: expect.any(MemoryCache),
          },
          transform: {
            active: false,
          },
        },
      })
    })

    it('should merge custom config with defaults', () => {
      const testApi = new Apimo('provider', 'token', {
        baseUrl: 'https://custom.api.com',
        culture: 'fr' as ApiCulture,
        catalogs: {
          cache: {
            active: false,
            adapter: new DummyCache(),
          },
        },
      })

      expect(testApi.config).toStrictEqual({
        baseUrl: 'https://custom.api.com',
        culture: 'fr',
        catalogs: {
          cache: {
            active: false,
            adapter: expect.any(DummyCache),
          },
          transform: {
            active: true,
          },
        },
      })
    })

    it('should use provided cache adapter', () => {
      const testApi = new Apimo('provider', 'token', {
        catalogs: {
          cache: {
            adapter: new DummyCache(),
          },
        },
      })
      expect(testApi.cache).toBeInstanceOf(DummyCache)
    })

    it('should use DummyCache when cache is not active', () => {
      const testApi = new Apimo('provider', 'token', {
        catalogs: {
          cache: {
            active: false,
            adapter: new MemoryCache(),
          },
        },
      })
      expect(testApi.cache).toBeInstanceOf(DummyCache)
    })
  })

  describe('fetch', () => {
    it('should have the right authorization headers when fetching', async () => {
      const testApi = new Apimo('provider', 'token')
      await testApi.fetch(DEFAULT_BASE_URL)

      expect(mockFetch).toHaveBeenCalledExactlyOnceWith(
        DEFAULT_BASE_URL,
        {
          headers: {
            Authorization: `Basic ${btoa('provider:token')}`,
          },
        },
      )
    })

    it('should merge additional headers with authorization', async ({ api }) => {
      const customHeaders = { 'Content-Type': 'application/json' }
      await api.fetch(DEFAULT_BASE_URL, { headers: customHeaders })

      expect(mockFetch).toHaveBeenCalledWith(
        DEFAULT_BASE_URL,
        {
          headers: {
            ...BasicAuthHeaders,
            'Content-Type': 'application/json',
          },
        },
      )
    })

    it('should pass through other fetch options', async ({ api }) => {
      const options = {
        method: 'POST',
        body: JSON.stringify({ test: 'data' }),
        headers: { 'Custom-Header': 'value' },
      }

      await api.fetch(DEFAULT_BASE_URL, options)

      expect(mockFetch).toHaveBeenCalledWith(
        DEFAULT_BASE_URL,
        {
          method: 'POST',
          body: JSON.stringify({ test: 'data' }),
          headers: {
            ...BasicAuthHeaders,
            'Custom-Header': 'value',
          },
        },
      )
    })

    it('should handle rate limiting with Bottleneck', async ({ api }) => {
      // Make multiple concurrent requests to test rate limiting
      const promises = Array.from({ length: 3 }, () => api.fetch(DEFAULT_BASE_URL))
      await Promise.all(promises)

      expect(mockFetch).toHaveBeenCalledTimes(3)
    })
  })

  describe('get', () => {
    it('should fetch and parse according to the specified schema', async ({ mockResponse, api }) => {
      mockResponse({
        json: () => ({ success: true }),
      })

      const spy = vi.spyOn(api, 'fetch')
      await api.get(['path', 'to', 'catalogs'], z.object({ success: z.boolean() }), { culture: 'en' })
      expect(spy).toHaveBeenCalledExactlyOnceWith(
        new URL('https://api.apimo.pro/path/to/catalogs?culture=en'),
      )
    })
  })

  describe('populateCache', () => {
    it('should populate cache without returning entry when no id provided', async ({ api, mockResponse }) => {
      const catalogName: CatalogName = 'property_type'
      const culture: ApiCulture = 'en'
      const mockEntries = [
        { id: 1, name: 'Apartment', name_plurial: 'Apartments' },
        { id: 2, name: 'House', name_plurial: 'Houses' },
      ]

      mockResponse({
        json: () => mockEntries,
      })

      const result = await api.populateCache(catalogName, culture)

      expect(result).toBeUndefined()
      expect(mockFetch).toHaveBeenCalledExactlyOnceWith(
        new URL(`https://api.apimo.pro/catalogs/${catalogName}?culture=${culture}`),
        {
          headers: BasicAuthHeaders,
        },
      )
    })

    it('should populate cache and return specific entry when id provided', async ({ api, mockResponse }) => {
      const catalogName: CatalogName = 'property_type'
      const culture: ApiCulture = 'en'
      const mockEntries = [
        { id: 1, name: 'Apartment', name_plurial: 'Apartments' },
        { id: 2, name: 'House', name_plurial: 'Houses' },
      ]

      mockResponse({
        json: () => mockEntries,
      })

      const result = await api.populateCache(catalogName, culture, 1)

      expect(result).toEqual({
        name: 'Apartment',
        namePlural: 'Apartments',
      })
    })

    it('should return null when requested id not found', async ({ api, mockResponse }) => {
      const catalogName: CatalogName = 'property_type'
      const culture: ApiCulture = 'en'
      const mockEntries = [
        { id: 1, name: 'Apartment', name_plurial: 'Apartments' },
      ]

      mockResponse({ json: () => mockEntries })

      const result = await api.populateCache(catalogName, culture, 999)

      expect(result).toBeNull()
    })
  })

  describe('constructor - validation', () => {
    it('should throw ApiConfigurationError when provider is empty', () => {
      expect(() => new Apimo('', 'TOKEN')).toThrowError(ApiConfigurationError)
    })

    it('should throw ApiConfigurationError when provider is blank whitespace', () => {
      expect(() => new Apimo('   ', 'TOKEN')).toThrowError(ApiConfigurationError)
    })

    it('should throw ApiConfigurationError when token is empty', () => {
      expect(() => new Apimo('0', '')).toThrowError(ApiConfigurationError)
    })

    it('should throw ApiConfigurationError when token is blank whitespace', () => {
      expect(() => new Apimo('0', '   ')).toThrowError(ApiConfigurationError)
    })

    it('should throw ApiConfigurationError when baseUrl is not a valid URL', () => {
      expect(() => new Apimo('0', 'TOKEN', { baseUrl: 'not-a-url' })).toThrowError(ApiConfigurationError)
    })

    it('should throw ApiConfigurationError when baseUrl is an empty string', () => {
      expect(() => new Apimo('0', 'TOKEN', { baseUrl: '' })).toThrowError(ApiConfigurationError)
    })

    it('apiConfigurationError is an instance of ApimoError', () => {
      expect(() => new Apimo('', 'TOKEN')).toThrowError(ApimoError)
    })

    it('apiConfigurationError message should include "Configuration error:"', () => {
      expect(() => new Apimo('', 'TOKEN')).toThrow('Configuration error:')
    })
  })

  describe('get - HTTP error mapping', () => {
    const httpErrorCases = [
      { status: 400, ErrorClass: ApiBadRequestError },
      { status: 401, ErrorClass: ApiUnauthorizedError },
      { status: 403, ErrorClass: ApiForbiddenError },
      { status: 404, ErrorClass: ApiNotFoundError },
      { status: 429, ErrorClass: ApiRateLimitError },
      { status: 500, ErrorClass: ApiServerError },
      { status: 503, ErrorClass: ApiServerError },
    ] as const

    for (const { status, ErrorClass } of httpErrorCases) {
      it(`should throw ${ErrorClass.name} for HTTP ${status}`, async ({ api, mockResponse }) => {
        mockResponse({ ok: false, status, json: () => ({ error: 'Some API error' }) })
        await expect(api.get(['path'], z.object({ success: z.boolean() }))).rejects.toThrowError(ErrorClass)
      })

      it(`${ErrorClass.name} (${status}) is an instance of ApiHttpError`, async ({ api, mockResponse }) => {
        mockResponse({ ok: false, status, json: () => null })
        await expect(api.get(['path'], z.object({ success: z.boolean() }))).rejects.toThrowError(ApiHttpError)
      })

      it(`${ErrorClass.name} (${status}) is an instance of ApimoError`, async ({ api, mockResponse }) => {
        mockResponse({ ok: false, status, json: () => null })
        await expect(api.get(['path'], z.object({ success: z.boolean() }))).rejects.toThrowError(ApimoError)
      })
    }

    it('should attach the correct statusCode property', async ({ api, mockResponse }) => {
      mockResponse({ ok: false, status: 404, json: () => null })
      const error = await api.get(['path'], z.object({ success: z.boolean() })).catch(e => e)
      expect(error).toBeInstanceOf(ApiNotFoundError)
      expect((error as ApiNotFoundError).statusCode).toBe(404)
    })

    it('should attach the response body to the error when available', async ({ api, mockResponse }) => {
      const body = { error: 'Not found', code: 42 }
      mockResponse({ ok: false, status: 404, json: () => body })
      const error = await api.get(['path'], z.object({ success: z.boolean() })).catch(e => e)
      expect(error).toBeInstanceOf(ApiNotFoundError)
      expect((error as ApiNotFoundError).responseBody).toEqual(body)
    })

    it('should attach the request URL to the error', async ({ api, mockResponse }) => {
      mockResponse({ ok: false, status: 401, json: () => null })
      const error = await api.get(['agencies'], z.object({ success: z.boolean() })).catch(e => e)
      expect(error).toBeInstanceOf(ApiUnauthorizedError)
      expect((error as ApiUnauthorizedError).url).toContain('agencies')
    })

    it('should handle non-JSON error body gracefully (no responseBody)', async ({ api }) => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
        text: vi.fn(),
        headers: new Headers(),
        statusText: 'Internal Server Error',
        url: '',
        redirected: false,
        type: 'basic',
        body: null,
        bodyUsed: false,
        clone: vi.fn(),
        arrayBuffer: vi.fn(),
        blob: vi.fn(),
        formData: vi.fn(),
      } as unknown as Response)

      const error = await api.get(['path'], z.object({ success: z.boolean() })).catch(e => e)
      expect(error).toBeInstanceOf(ApiServerError)
      expect((error as ApiServerError).responseBody).toBeUndefined()
    })

    it('should throw generic ApiHttpError for uncommon non-5xx, non-mapped status codes', async ({ api, mockResponse }) => {
      mockResponse({ ok: false, status: 418, json: () => null })
      const error = await api.get(['path'], z.object({ success: z.boolean() })).catch(e => e)
      expect(error).toBeInstanceOf(ApiHttpError)
      expect((error as ApiHttpError).statusCode).toBe(418)
    })
  })

  describe('get - response validation', () => {
    it('should throw ApiResponseValidationError when response does not match schema', async ({ api, mockResponse }) => {
      mockResponse({ json: () => ({ wrongField: 'bad data' }) })
      await expect(
        api.get(['catalogs'], z.object({ success: z.boolean() })),
      ).rejects.toThrowError(ApiResponseValidationError)
    })

    it('should include the request URL in ApiResponseValidationError', async ({ api, mockResponse }) => {
      mockResponse({ json: () => ({ wrongField: 'bad data' }) })
      const error = await api.get(['catalogs'], z.object({ success: z.boolean() })).catch(e => e)
      expect(error).toBeInstanceOf(ApiResponseValidationError)
      expect((error as ApiResponseValidationError).url).toContain('catalogs')
    })

    it('should expose zodError with issue details on ApiResponseValidationError', async ({ api, mockResponse }) => {
      mockResponse({ json: () => ({ wrongField: 'bad data' }) })
      const error = await api.get(['catalogs'], z.object({ success: z.boolean() })).catch(e => e)
      expect(error).toBeInstanceOf(ApiResponseValidationError)
      expect((error as ApiResponseValidationError).zodError.issues.length).toBeGreaterThan(0)
    })

    it('apiResponseValidationError message should contain field path information', async ({ api, mockResponse }) => {
      mockResponse({ json: () => ({ success: 'not-a-boolean' }) })
      const error = await api.get(['catalogs'], z.object({ success: z.boolean() })).catch(e => e)
      expect(error).toBeInstanceOf(ApiResponseValidationError)
      expect((error as ApiResponseValidationError).message).toContain('success')
    })

    it('apiResponseValidationError is an instance of ApimoError', async ({ api, mockResponse }) => {
      mockResponse({ json: () => ({ wrongField: 'bad data' }) })
      await expect(
        api.get(['catalogs'], z.object({ success: z.boolean() })),
      ).rejects.toThrowError(ApimoError)
    })
  })
})
