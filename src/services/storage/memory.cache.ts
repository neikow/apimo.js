import type { CatalogName } from '../../consts/catalogs'
import type { ApiCulture } from '../../consts/languages'
import type { CatalogEntry } from '../../schemas/common'
import type { CatalogCacheAdapter, CatalogEntryName } from './types'
import { CacheExpiredError } from './types'

const MS_IN_ONE_WEEK = 7 * 24 * 60 * 60 * 1000

type Memory = Map<string, {
  timestamp: number
  cache: Map<number, CatalogEntryName>
}>

export class MemoryCache implements CatalogCacheAdapter {
  readonly cacheExpirationMs: number
  readonly _MEMORY: Memory

  constructor(settings?: { cacheExpirationMs?: number }) {
    this.cacheExpirationMs = settings?.cacheExpirationMs ?? MS_IN_ONE_WEEK
    this._MEMORY = new Map()
  }

  async setEntries(catalogName: CatalogName, culture: ApiCulture, entries: CatalogEntry[]): Promise<void> {
    const memoryEntry = new Map(
      entries.map<[number, CatalogEntryName]>(({ id, name, name_plurial }) => [id, {
        name,
        namePlural: name_plurial,
      }]),
    )
    this._MEMORY.set(this.getCacheKey(catalogName, culture), {
      timestamp: Date.now(),
      cache: memoryEntry,
    })
  }

  async getEntry(catalogName: CatalogName, culture: ApiCulture, id: number) {
    const memoryEntry = this._MEMORY.get(this.getCacheKey(catalogName, culture))

    if (!memoryEntry) {
      throw new CacheExpiredError()
    }
    if (memoryEntry.timestamp + this.cacheExpirationMs < Date.now()) {
      throw new CacheExpiredError()
    }

    return memoryEntry.cache.get(id) ?? null
  }

  async getEntries(catalogName: CatalogName, culture: ApiCulture): Promise<CatalogEntry[]> {
    const memoryEntry = this._MEMORY.get(this.getCacheKey(catalogName, culture))

    if (!memoryEntry) {
      throw new CacheExpiredError()
    }
    if (memoryEntry.timestamp + this.cacheExpirationMs < Date.now()) {
      throw new CacheExpiredError()
    }

    return Array.from(memoryEntry.cache.entries()).map(([id, { name, namePlural }]) => ({
      id,
      name,
      name_plurial: namePlural,
    }))
  }

  private getCacheKey(catalogName: CatalogName, culture: ApiCulture) {
    return `${catalogName}.${culture}`
  }
}
