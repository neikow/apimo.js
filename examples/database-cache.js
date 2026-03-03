/* eslint-disable no-unused-vars,unused-imports/no-unused-vars */
/**
 * Database Cache Example for apimo.js
 *
 * Optional Dependencies:
 * - For SQLite: npm install better-sqlite3
 * - For PostgreSQL: npm install pg
 */
import { Apimo, DatabaseCache } from 'apimo.js'

// Example: Using SQLite DatabaseCache
const sqliteCache = new DatabaseCache({
  type: 'sqlite',
  sqlite: {
    path: './cache/apimo_catalogs.db',
  },
  cacheExpirationMs: 7 * 24 * 60 * 60 * 1000, // 1 week
})

// Example: Using PostgreSQL DatabaseCache
const postgresCache = new DatabaseCache({
  type: 'postgres',
  postgres: {
    connectionString: 'postgresql://user:password@localhost:5432/apimo_cache',
  },
  cacheExpirationMs: 24 * 60 * 60 * 1000, // 1 day
})

// Initialize API with database cache
const api = new Apimo('your_provider_id', 'your_token', {
  catalogs: {
    cache: {
      active: true,
      adapter: sqliteCache, // or postgresCache
    },
  },
})

// Usage example
async function example() {
  try {
    // This will automatically cache the results in the database
    const propertyTypes = await api.getCatalogEntries('property_type', { culture: 'en' })
    console.warn('Property types:', propertyTypes)

    // This will retrieve from cache if still valid
    const propertyCategories = await api.getCatalogEntries('property_category', { culture: 'fr' })
    console.warn('Property categories:', propertyCategories)

    // Don't forget to close the database connection when done
    await sqliteCache.close()
  }
  catch (error) {
    console.error('Error:', error)
  }
}

// example()
