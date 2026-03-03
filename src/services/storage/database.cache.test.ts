import type { CatalogName } from '../../consts/catalogs'
import type { ApiCulture } from '../../consts/languages'
import type { CatalogEntry } from '../../schemas/common'
import type { DatabaseCacheConfig } from './database.cache'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseCache } from './database.cache'
import { CacheExpiredError } from './types'

describe('databaseCache', () => {
  const testEntries: CatalogEntry[] = [
    { id: 1, name: 'Single Family Home', name_plurial: 'Single Family Homes' },
    { id: 2, name: 'Apartment', name_plurial: 'Apartments' },
    { id: 3, name: 'Condo', name_plurial: 'Condos' },
  ]

  describe('sQLite', () => {
    let cache: DatabaseCache
    const config: DatabaseCacheConfig = {
      type: 'sqlite',
      sqlite: { path: ':memory:' },
      cacheExpirationMs: 1000,
    }

    beforeEach(() => {
      cache = new DatabaseCache(config)
    })

    it('should store and retrieve entries', async () => {
      await cache.setEntries('property_type' as CatalogName, 'en' as ApiCulture, testEntries)
      const retrieved = await cache.getEntries('property_type' as CatalogName, 'en' as ApiCulture)

      expect(retrieved).toHaveLength(3)
      expect(retrieved[0]).toEqual({ id: 1, name: 'Single Family Home', name_plurial: 'Single Family Homes' })
    })

    it('should store and retrieve individual entry', async () => {
      await cache.setEntries('property_type' as CatalogName, 'en' as ApiCulture, testEntries)
      const entry = await cache.getEntry('property_type' as CatalogName, 'en' as ApiCulture, 2)

      expect(entry).toEqual({ name: 'Apartment', namePlural: 'Apartments' })
    })

    it('should return null for non-existent entry', async () => {
      const entry = await cache.getEntry('property_type' as CatalogName, 'en' as ApiCulture, 999)
      expect(entry).toBeNull()
    })

    it('should throw CacheExpiredError after expiration', async () => {
      const shortConfig: DatabaseCacheConfig = {
        ...config,
        cacheExpirationMs: 1, // 1ms expiration
      }
      const shortCache = new DatabaseCache(shortConfig)

      await shortCache.setEntries('property_type' as CatalogName, 'en' as ApiCulture, testEntries)

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10))

      await expect(shortCache.getEntries('property_type' as CatalogName, 'en' as ApiCulture))
        .rejects
        .toThrow(CacheExpiredError)

      await expect(shortCache.getEntry('property_type' as CatalogName, 'en' as ApiCulture, 1))
        .rejects
        .toThrow(CacheExpiredError)

      await shortCache.close()
    })

    it('should handle different catalogs and cultures separately', async () => {
      await cache.setEntries('property_type' as CatalogName, 'en' as ApiCulture, testEntries)
      await cache.setEntries('property_type' as CatalogName, 'fr' as ApiCulture, [
        { id: 1, name: 'Maison Individuelle', name_plurial: 'Maisons Individuelles' },
      ])

      const enEntries = await cache.getEntries('property_type' as CatalogName, 'en' as ApiCulture)
      const frEntries = await cache.getEntries('property_type' as CatalogName, 'fr' as ApiCulture)

      expect(enEntries).toHaveLength(3)
      expect(frEntries).toHaveLength(1)
      expect(frEntries[0].name).toBe('Maison Individuelle')
    })

    afterEach(async () => {
      await cache.close()
    })
  })

  describe('error handling', () => {
    it('should throw error for invalid database type', () => {
      expect(() => new DatabaseCache({
        type: 'invalid' as any,
      })).toThrow('Unsupported database type: invalid')
    })

    it('should throw error when SQLite path is missing', () => {
      expect(() => new DatabaseCache({
        type: 'sqlite',
      })).toThrow('SQLite path is required when using SQLite database type')
    })

    it('should throw error when PostgreSQL config is missing', () => {
      expect(() => new DatabaseCache({
        type: 'postgres',
      })).toThrow('PostgreSQL configuration is required when using PostgreSQL database type')
    })
  })
})
