import type { CatalogName } from '../../consts/catalogs'
import type { ApiCulture } from '../../consts/languages'
import type { CatalogEntry } from '../../schemas/common'
import type { CatalogCacheAdapter, CatalogEntryName } from './types'
import { mkdirSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import * as path from 'node:path'
import { CacheExpiredError } from './types'

const DEFAULT_FILESYSTEM_CACHE_LOCATION = './cache/catalogs'
const MS_IN_ONE_WEEK = 7 * 24 * 60 * 60 * 1000

export class FilesystemCache implements CatalogCacheAdapter {
  private readonly path: string
  private readonly cacheExpirationMs: number

  constructor(settings?: { path?: string, cacheExpirationMs?: number }) {
    this.path = settings?.path ?? DEFAULT_FILESYSTEM_CACHE_LOCATION
    this.cacheExpirationMs = settings?.cacheExpirationMs ?? MS_IN_ONE_WEEK

    mkdirSync(this.path, { recursive: true })
  }

  async setEntries(catalogName: CatalogName, culture: ApiCulture, entries: CatalogEntry[]): Promise<void> {
    const filePath = this.getCacheFilePath(catalogName, culture)
    const formattedEntries = Object.fromEntries(
      entries.map<[
        string,
        CatalogEntryName,
      ]>(({ id, name, name_plurial }) => [id.toString(), {
        name,
        namePlural: name_plurial,
      }]),
    )
    const dump = JSON.stringify({
      timestamp: Date.now(),
      cache: formattedEntries,
    })
    return writeFile(filePath, dump)
  }

  async readFileOrThrow(filePath: string): Promise<string> {
    try {
      return await readFile(filePath, 'utf-8')
    }
    catch {
      throw new CacheExpiredError()
    }
  }

  async getEntry(catalogName: CatalogName, culture: ApiCulture, id: number): Promise<CatalogEntryName | null> {
    const filePath = this.getCacheFilePath(catalogName, culture)
    const data = await this.readFileOrThrow(filePath)
    const parsed: {
      timestamp: number
      cache: { [id: string]: CatalogEntryName | undefined }
    } = JSON.parse(data)

    const currentTimestamp = Date.now()
    if (parsed.timestamp + this.cacheExpirationMs < currentTimestamp) {
      throw new CacheExpiredError()
    }

    return parsed.cache[id.toString()] ?? null
  }

  async getEntries(catalogName: CatalogName, culture: ApiCulture): Promise<CatalogEntry[]> {
    const filePath = this.getCacheFilePath(catalogName, culture)
    const data = await this.readFileOrThrow(filePath)
    const parsed: {
      timestamp: number
      cache: { [id: string]: CatalogEntryName | undefined }
    } = JSON.parse(data)

    const currentTimestamp = Date.now()
    if (parsed.timestamp + this.cacheExpirationMs < currentTimestamp) {
      throw new CacheExpiredError()
    }

    return Object.entries(parsed.cache).map(([id, entry]) => ({
      id: Number.parseInt(id, 10),
      name: entry?.name ?? 'missing',
      name_plurial: entry?.namePlural,
    }))
  }

  private getCacheFilePath(catalogName: CatalogName, culture: ApiCulture) {
    return path.join(this.path, this.getCacheFileName(catalogName, culture))
  }

  private getCacheFileName(catalogName: CatalogName, culture: ApiCulture) {
    return `${catalogName}-${culture}.json`
  }
}
