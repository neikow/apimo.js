import type { MockedFunction } from 'vitest'
import type { ApiCulture } from '../consts/languages'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiConfigurationError,
  ApimoError,
  ApiResponseValidationError,
} from '../errors'
import { DummyCache } from '../services/storage/dummy.cache'
import { MemoryCache } from '../services/storage/memory.cache'
import { Apimo, DEFAULT_BASE_URL } from './api'

const mockFetch = vi.fn() as MockedFunction<typeof fetch>

const PROVIDER = '0'
const TOKEN = 'TOKEN'
const BASIC_AUTH = `Basic ${btoa(`${PROVIDER}:${TOKEN}`)}`

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

/**
 * Builds an Apimo client with retries disabled and a fresh cache, so tests
 * don't share the module-level MemoryCache held by DEFAULT_ADDITIONAL_CONFIG.
 */
function makeApi() {
  return new Apimo(PROVIDER, TOKEN, {
    retry: { attempts: 1 },
    catalogs: { cache: { adapter: new MemoryCache() } },
  })
}

describe('apimo', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockResolvedValue(makeMockResponse())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('accepts a provider, token and base config', () => {
      expect(makeApi()).toBeInstanceOf(Apimo)
    })

    it('uses the default config when none is provided', () => {
      const api = new Apimo(PROVIDER, TOKEN)
      expect(api.config).toStrictEqual({
        baseUrl: DEFAULT_BASE_URL,
        culture: 'en' as ApiCulture,
        retry: {
          attempts: 3,
          initialDelayMs: 200,
          backoff: 'exponential',
        },
        catalogs: {
          cache: {
            active: true,
            adapter: expect.any(MemoryCache),
          },
        },
      })
    })

    it('merges custom config with defaults', () => {
      const api = new Apimo('provider', 'token', {
        baseUrl: 'https://custom.api.com',
        culture: 'fr' as ApiCulture,
        retry: { attempts: 5 },
      })

      expect(api.config.baseUrl).toBe('https://custom.api.com')
      expect(api.config.culture).toBe('fr')
      expect(api.config.retry).toEqual({ attempts: 5, initialDelayMs: 200, backoff: 'exponential' })
    })

    it('uses the provided cache adapter', () => {
      const api = new Apimo('provider', 'token', { catalogs: { cache: { adapter: new DummyCache() } } })
      expect(api.cache).toBeInstanceOf(DummyCache)
    })

    it('falls back to DummyCache when caching is disabled', () => {
      const api = new Apimo('provider', 'token', { catalogs: { cache: { active: false, adapter: new MemoryCache() } } })
      expect(api.cache).toBeInstanceOf(DummyCache)
    })

    it.each([
      ['empty provider', '', TOKEN],
      ['blank provider', '   ', TOKEN],
      ['empty token', PROVIDER, ''],
      ['blank token', PROVIDER, '   '],
    ])('throws ApiConfigurationError for %s', (_label, provider, token) => {
      expect(() => new Apimo(provider, token)).toThrowError(ApiConfigurationError)
    })

    it('throws ApiConfigurationError for an invalid baseUrl', () => {
      expect(() => new Apimo(PROVIDER, TOKEN, { baseUrl: 'not-a-url' })).toThrowError(ApiConfigurationError)
    })

    it('apiConfigurationError is an ApimoError', () => {
      expect(() => new Apimo('', TOKEN)).toThrowError(ApimoError)
    })
  })

  describe('fetchProperties', () => {
    it('requests the agency properties endpoint with Basic auth', async () => {
      mockFetch.mockResolvedValue(makeMockResponse({ json: () => ({ total_items: 0, timestamp: 0, properties: [] }) }))

      await makeApi().fetchProperties(123, { limit: 10, offset: 0 })

      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toContain('/agencies/123/properties')
      expect(url).toContain('limit=10')
      expect((init?.headers as Record<string, string>).Authorization).toBe(BASIC_AUTH)
    })

    // Regression: the production error was
    //   [properties.0.user.firstname] Invalid input: expected string, received undefined
    // The OpenAPI spec marks every User field optional, so a property whose
    // `user` is missing firstname/lastname/language/group/email must now parse.
    it('parses properties even when user fields are missing (regression)', async () => {
      mockFetch.mockResolvedValue(makeMockResponse({
        json: () => ({
          total_items: 1,
          timestamp: 1712000000,
          properties: [{ id: 1, user: { id: 7 } }],
        }),
      }))

      const result = await makeApi().fetchProperties(123)

      expect(result.properties?.[0]?.id).toBe(1)
      expect(result.properties?.[0]?.user?.id).toBe(7)
    })

    it('throws ApiResponseValidationError when the body shape is wrong', async () => {
      mockFetch.mockResolvedValue(makeMockResponse({ json: () => ({ total_items: 'not-a-number' }) }))

      await expect(makeApi().fetchProperties(123)).rejects.toThrowError(ApiResponseValidationError)
    })
  })

  describe('fetchCatalogs', () => {
    it('returns the catalog list', async () => {
      mockFetch.mockResolvedValue(makeMockResponse({
        json: () => [{ name: 'property_type', path: '/catalogs/property_type' }],
      }))

      const result = await makeApi().fetchCatalogs()
      expect(result).toEqual([{ name: 'property_type', path: '/catalogs/property_type' }])
    })
  })

  describe('catalog cache helpers', () => {
    it('populates the cache and resolves an entry by id', async () => {
      mockFetch.mockResolvedValue(makeMockResponse({
        json: () => [
          { id: 1, name: 'Apartment', name_plurial: 'Apartments' },
          { id: 2, name: 'House', name_plurial: 'Houses' },
        ],
      }))

      const api = makeApi()
      const entry = await api.populateCache('property_type', 'en', 1)
      expect(entry).toEqual({ name: 'Apartment', namePlural: 'Apartments' })
    })

    it('returns null when the requested id is absent', async () => {
      mockFetch.mockResolvedValue(makeMockResponse({
        json: () => [{ id: 1, name: 'Apartment', name_plurial: 'Apartments' }],
      }))

      const entry = await makeApi().populateCache('property_type', 'en', 999)
      expect(entry).toBeNull()
    })

    it('getCatalogEntries fetches from the API on a cache miss', async () => {
      mockFetch.mockResolvedValue(makeMockResponse({
        json: () => [{ id: 1, name: 'Apartment', name_plurial: 'Apartments' }],
      }))

      const entries = await makeApi().getCatalogEntries('property_type', { culture: 'en' })
      expect(entries).toEqual([{ id: 1, name: 'Apartment', name_plurial: 'Apartments', culture: undefined }])
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })
})
