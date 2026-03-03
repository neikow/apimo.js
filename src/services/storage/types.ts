import type { CatalogName } from '../../consts/catalogs'
import type { ApiCulture } from '../../consts/languages'
import type { CatalogEntry } from '../../schemas/common'

export interface CatalogEntryName {
  name: string
  namePlural: string | undefined
}

export interface CatalogCacheAdapter {
  setEntries: (catalogName: CatalogName, culture: ApiCulture, entries: CatalogEntry[]) => Promise<void>
  getEntry: (catalogName: CatalogName, culture: ApiCulture, id: number) => Promise<CatalogEntryName | null>
  getEntries: (catalogName: CatalogName, culture: ApiCulture) => Promise<CatalogEntry[]>
}

// @deprecated Use CatalogCacheAdapter instead
export interface ApiCacheAdapter extends CatalogCacheAdapter {}

export class CacheExpiredError extends Error {
}

export class NotInCacheError extends Error {
}
