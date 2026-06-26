import type { z } from 'zod'
import type { ApimoRequestContext, RetryConfig } from '../api/mutator'
import type { CatalogName } from '../consts/catalogs'
import type { ApiCulture } from '../consts/languages'
import type { GetCatalogParams, ListAgenciesParams, ListPropertiesParams } from '../generated/client/model'
import type { CatalogEntry } from '../schemas/common'
import type { ApiCacheAdapter, CatalogEntryName } from '../services/storage/types'
import type { DeepPartial } from '../types'
import type { ApiSearchParams } from '../utils/url'
import Bottleneck from 'bottleneck'
import { merge } from 'merge-anything'
import { apimoRequestContext } from '../api/context'
import { ApiConfigurationError, ApiResponseValidationError } from '../errors'
import {
  getCatalog,
  listAgencies,
  listCatalogs,
  listProperties,
  listUsers,
} from '../generated/client/apimo'
import {
  GetCatalogResponse,
  ListAgenciesResponse,
  ListCatalogsResponse,
  ListPropertiesResponse,
  ListUsersResponse,
} from '../generated/zod/apimo.zod'
import { DummyCache } from '../services/storage/dummy.cache'
import { MemoryCache } from '../services/storage/memory.cache'
import { CacheExpiredError } from '../services/storage/types'

/**
 * ApiConfig
 * ---
 *
 * The general config used to create an `Apimo` client. The client wraps the
 * orval-generated API client (see `src/generated`) and layers on the
 * cross-cutting concerns the generated code is agnostic about: authentication,
 * rate-limiting, retries and runtime response validation (via the generated Zod
 * schemas).
 */
export interface AdditionalConfig {
  /** Base URL for API access. Defaults to "https://api.apimo.pro". */
  baseUrl: string
  /** Default language used when none is provided. Translates to "culture" in the API. */
  culture: ApiCulture
  /** Automatic retry configuration for transient failures (429, 5xx, network errors). */
  retry: RetryConfig
  /** Catalog caching configuration. */
  catalogs: {
    cache: {
      /** Whether to cache catalog entries. `false` disables caching entirely. */
      active: boolean
      /** Where catalog entries are stored. */
      adapter: ApiCacheAdapter
    }
  }
}

export const DEFAULT_BASE_URL = 'https://api.apimo.pro'

export const DEFAULT_ADDITIONAL_CONFIG: AdditionalConfig = {
  baseUrl: DEFAULT_BASE_URL,
  culture: 'en',
  retry: {
    attempts: 3,
    initialDelayMs: 200,
    backoff: 'exponential',
  },
  catalogs: {
    cache: {
      active: true,
      adapter: new MemoryCache(),
    },
  },
}

export class Apimo {
  readonly config: AdditionalConfig
  readonly cache: ApiCacheAdapter
  readonly limiter: Bottleneck
  private readonly authHeader: string

  constructor(
    // The site identifier, in a string of numbers format. You can request yours by contacting Apimo.net customer service.
    provider: string,
    // The secret token for API authentication
    token: string,
    // Additional config, to tweak how the API is handled
    config: DeepPartial<AdditionalConfig> = DEFAULT_ADDITIONAL_CONFIG,
  ) {
    if (!provider || provider.trim() === '') {
      throw new ApiConfigurationError('provider must be a non-empty string.')
    }
    if (!token || token.trim() === '') {
      throw new ApiConfigurationError('token must be a non-empty string.')
    }

    this.config = merge(DEFAULT_ADDITIONAL_CONFIG, config) as AdditionalConfig

    if (!this.config.baseUrl || this.config.baseUrl.trim() === '') {
      throw new ApiConfigurationError('baseUrl must be a non-empty string.')
    }
    try {
      // eslint-disable-next-line no-new
      new URL(this.config.baseUrl)
    }
    catch {
      throw new ApiConfigurationError(`baseUrl "${this.config.baseUrl}" is not a valid URL.`)
    }

    this.authHeader = `Basic ${btoa(`${provider}:${token}`)}`
    this.cache = this.config.catalogs.cache.active ? this.config.catalogs.cache.adapter : new DummyCache()
    this.limiter = new Bottleneck({
      reservoir: 10,
      reservoirRefreshAmount: 10,
      reservoirRefreshInterval: 1000,
    })
  }

  // ---------------------------------------------------------------------------
  // Endpoints
  // ---------------------------------------------------------------------------

  /** Retrieve the list of available catalogs. */
  public async fetchCatalogs() {
    const response = await this.run(() => listCatalogs())
    return this.parse(ListCatalogsResponse, response, '/catalogs')
  }

  /** Retrieve the entries of a single catalog (e.g. `property_type`). */
  public async fetchCatalog(catalogName: CatalogName, options?: Pick<ApiSearchParams, 'culture'>) {
    const params: GetCatalogParams = { culture: options?.culture ?? this.config.culture }
    const response = await this.run(() => getCatalog(catalogName, params))
    return this.parse(GetCatalogResponse, response, `/catalogs/${catalogName}`)
  }

  /** Retrieve the agencies (business units) reachable with the current credentials. */
  public async fetchAgencies(params?: ListAgenciesParams) {
    const response = await this.run(() => listAgencies(params))
    return this.parse(ListAgenciesResponse, response, '/agencies')
  }

  /** Retrieve the paginated list of properties for an agency. */
  public async fetchProperties(agencyId: number, params?: ListPropertiesParams) {
    const response = await this.run(() => listProperties(agencyId, params))
    return this.parse(ListPropertiesResponse, response, `/agencies/${agencyId}/properties`)
  }

  /** Retrieve the users (negotiators) of an agency. */
  public async fetchUsers(agencyId: number) {
    const response = await this.run(() => listUsers(agencyId))
    return this.parse(ListUsersResponse, response, `/agencies/${agencyId}/users`)
  }

  // ---------------------------------------------------------------------------
  // Catalog cache helpers
  // ---------------------------------------------------------------------------

  public async populateCache(catalogName: CatalogName, culture: ApiCulture): Promise<void>
  public async populateCache(catalogName: CatalogName, culture: ApiCulture, id: number): Promise<CatalogEntryName | null>
  public async populateCache(catalogName: CatalogName, culture: ApiCulture, id?: number): Promise<void | CatalogEntryName | null> {
    const catalog = await this.fetchCatalog(catalogName, { culture })
    const entries: CatalogEntry[] = catalog
      .filter((entry): entry is typeof entry & { id: number, name: string } => entry.id != null && entry.name != null)
      .map(entry => ({
        id: entry.id,
        name: entry.name,
        name_plurial: entry.name_plurial ?? undefined,
        culture: entry.culture,
      }))

    await this.cache.setEntries(catalogName, culture, entries)

    if (id !== undefined) {
      const found = entries.find(entry => entry.id === id)
      return found ? { name: found.name, namePlural: found.name_plurial } : null
    }
  }

  /** Returns a catalog's entries, populating the cache from the API on a miss. */
  public async getCatalogEntries(catalogName: CatalogName, options?: Pick<ApiSearchParams, 'culture'>): Promise<CatalogEntry[]> {
    const culture = options?.culture ?? this.config.culture
    try {
      return await this.cache.getEntries(catalogName, culture)
    }
    catch (e) {
      if (e instanceof CacheExpiredError) {
        await this.populateCache(catalogName, culture)
        return this.cache.getEntries(catalogName, culture)
      }
      throw e
    }
  }

  /** Resolves a single catalog entry id to its localized name, using the cache. */
  public async getCatalogEntry(catalogName: CatalogName, id: number, options?: Pick<ApiSearchParams, 'culture'>): Promise<CatalogEntryName | null> {
    const culture = options?.culture ?? this.config.culture
    try {
      return await this.cache.getEntry(catalogName, culture, id)
    }
    catch (e) {
      if (e instanceof CacheExpiredError) {
        return this.populateCache(catalogName, culture, id)
      }
      throw e
    }
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /** Per-instance context handed to the generated client's custom mutator. */
  private get requestContext(): ApimoRequestContext {
    return {
      baseUrl: this.config.baseUrl,
      authHeader: this.authHeader,
      limiter: this.limiter,
      retry: this.config.retry,
    }
  }

  /** Runs a generated client call within this instance's request context. */
  private run<T>(fn: () => Promise<T>): Promise<T> {
    return apimoRequestContext.run(this.requestContext, fn)
  }

  /** Validates a response body against a generated Zod schema. */
  private parse<S extends z.ZodTypeAny>(schema: S, response: { data: unknown }, label: string): z.infer<S> {
    const result = schema.safeParse(response.data)
    if (!result.success) {
      throw new ApiResponseValidationError(label, result.error)
    }
    return result.data
  }
}
