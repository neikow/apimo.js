import type { CatalogName } from '../../consts/catalogs'
import type { ApiCulture } from '../../consts/languages'
import type { CatalogEntry } from '../../schemas/common'
import type { CatalogCacheAdapter, CatalogEntryName } from './types'
import { CacheExpiredError } from './types'

// Optional dependency imports - will be checked at runtime
let SqliteDatabase: typeof import('better-sqlite3') | null = null
let PostgresClient: typeof import('pg').Client | null = null

// Runtime dependency loading
function loadSqlite(): typeof SqliteDatabase {
  if (!SqliteDatabase) {
    try {
      // eslint-disable-next-line ts/no-require-imports
      SqliteDatabase = require('better-sqlite3')
    }
    catch {
      throw new Error(
        'better-sqlite3 is required for SQLite database caching. Install it with: npm install better-sqlite3',
      )
    }
  }
  return SqliteDatabase
}

function loadPostgres(): typeof PostgresClient {
  if (!PostgresClient) {
    try {
      // eslint-disable-next-line ts/no-require-imports
      const pg = require('pg')
      PostgresClient = pg.Client
    }
    catch {
      throw new Error(
        'pg is required for PostgreSQL database caching. Install it with: npm install pg',
      )
    }
  }
  return PostgresClient
}

const MS_IN_ONE_WEEK = 7 * 24 * 60 * 60 * 1000

export type DatabaseType = 'sqlite' | 'postgres'

export interface DatabaseCacheConfig {
  type: DatabaseType
  cacheExpirationMs?: number
  // SQLite specific options
  sqlite?: {
    path: string
  }
  // PostgreSQL specific options
  postgres?: {
    connectionString?: string
    host?: string
    port?: number
    database?: string
    user?: string
    password?: string
  }
}

interface CacheRow {
  catalog_name: string
  culture: string
  entry_id: number
  entry_name: string
  entry_name_plural: string | null
  created_at: Date
}

export class DatabaseCache implements CatalogCacheAdapter {
  private readonly config: DatabaseCacheConfig
  private readonly cacheExpirationMs: number
  private sqliteDb?: any
  private pgClient?: any

  constructor(config: DatabaseCacheConfig) {
    this.config = config
    this.cacheExpirationMs = config.cacheExpirationMs ?? MS_IN_ONE_WEEK
    this.validateDependencies()
    this.initialize()
  }

  async setEntries(catalogName: CatalogName, culture: ApiCulture, entries: CatalogEntry[]): Promise<void> {
    const timestamp = new Date()

    if (this.config.type === 'sqlite') {
      await this.setSqliteEntries(catalogName, culture, entries, timestamp)
    }
    else if (this.config.type === 'postgres') {
      await this.initializePostgres()
      await this.setPostgresEntries(catalogName, culture, entries, timestamp)
    }
  }

  async getEntry(catalogName: CatalogName, culture: ApiCulture, id: number): Promise<CatalogEntryName | null> {
    if (this.config.type === 'sqlite') {
      return this.getSqliteEntry(catalogName, culture, id)
    }
    else if (this.config.type === 'postgres') {
      await this.initializePostgres()
      return this.getPostgresEntry(catalogName, culture, id)
    }
    return null
  }

  async getEntries(catalogName: CatalogName, culture: ApiCulture): Promise<CatalogEntry[]> {
    if (this.config.type === 'sqlite') {
      return this.getSqliteEntries(catalogName, culture)
    }
    else if (this.config.type === 'postgres') {
      await this.initializePostgres()
      return this.getPostgresEntries(catalogName, culture)
    }
    return []
  }

  async close(): Promise<void> {
    if (this.sqliteDb) {
      this.sqliteDb.close()
    }
    if (this.pgClient) {
      await this.pgClient.end()
    }
  }

  private validateDependencies(): void {
    if (this.config.type === 'sqlite') {
      try {
        require.resolve('better-sqlite3')
      }
      catch {
        throw new Error(
          'better-sqlite3 is required for SQLite database caching. Install it with: npm install better-sqlite3',
        )
      }
    }
    else if (this.config.type === 'postgres') {
      try {
        require.resolve('pg')
      }
      catch {
        throw new Error(
          'pg is required for PostgreSQL database caching. Install it with: npm install pg',
        )
      }
    }
  }

  private initialize(): void {
    if (this.config.type === 'sqlite') {
      this.initializeSqlite()
    }
    else if (this.config.type === 'postgres') {
      this.validatePostgresConfig()
    }
    else {
      throw new Error(`Unsupported database type: ${this.config.type}`)
    }
  }

  private validatePostgresConfig(): void {
    const pgConfig = this.config.postgres
    if (!pgConfig) {
      throw new Error('PostgreSQL configuration is required when using PostgreSQL database type')
    }
  }

  private initializeSqlite(): void {
    if (!this.config.sqlite?.path) {
      throw new Error('SQLite path is required when using SQLite database type')
    }

    const SqliteDatabase = loadSqlite()
    this.sqliteDb = new SqliteDatabase!(this.config.sqlite.path)

    // Create table if it doesn't exist
    this.sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS catalog_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        catalog_name TEXT NOT NULL,
        culture TEXT NOT NULL,
        entry_id INTEGER NOT NULL,
        entry_name TEXT NOT NULL,
        entry_name_plural TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(catalog_name, culture, entry_id)
      )
    `)

    // Create index for faster lookups
    this.sqliteDb.exec(`
      CREATE INDEX IF NOT EXISTS idx_catalog_cache_lookup 
      ON catalog_cache(catalog_name, culture, created_at)
    `)
  }

  private async initializePostgres(): Promise<void> {
    if (this.pgClient)
      return // Already initialized

    const pgConfig = this.config.postgres!
    const PostgresClient = loadPostgres()

    this.pgClient = new PostgresClient!(pgConfig.connectionString
      ? { connectionString: pgConfig.connectionString }
      : {
          host: pgConfig.host,
          port: pgConfig.port,
          database: pgConfig.database,
          user: pgConfig.user,
          password: pgConfig.password,
        },
    )

    await this.pgClient.connect()

    // Create table if it doesn't exist
    await this.pgClient.query(`
      CREATE TABLE IF NOT EXISTS catalog_cache (
        id SERIAL PRIMARY KEY,
        catalog_name VARCHAR(255) NOT NULL,
        culture VARCHAR(10) NOT NULL,
        entry_id INTEGER NOT NULL,
        entry_name TEXT NOT NULL,
        entry_name_plural TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(catalog_name, culture, entry_id)
      )
    `)

    // Create index for faster lookups
    await this.pgClient.query(`
      CREATE INDEX IF NOT EXISTS idx_catalog_cache_lookup 
      ON catalog_cache(catalog_name, culture, created_at)
    `)
  }

  private async setSqliteEntries(
    catalogName: CatalogName,
    culture: ApiCulture,
    entries: CatalogEntry[],
    timestamp: Date,
  ): Promise<void> {
    if (!this.sqliteDb)
      throw new Error('SQLite database not initialized')

    const transaction = this.sqliteDb.transaction((entries: CatalogEntry[]) => {
      // Clear existing entries for this catalog and culture
      this.sqliteDb!.prepare(`
        DELETE FROM catalog_cache 
        WHERE catalog_name = ? AND culture = ?
      `).run(catalogName, culture)

      // Insert new entries
      const insertStmt = this.sqliteDb!.prepare(`
        INSERT OR REPLACE INTO catalog_cache 
        (catalog_name, culture, entry_id, entry_name, entry_name_plural, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)

      for (const entry of entries) {
        insertStmt.run(
          catalogName,
          culture,
          entry.id,
          entry.name,
          entry.name_plurial || null,
          timestamp.toISOString(),
        )
      }
    })

    transaction(entries)
  }

  private async setPostgresEntries(
    catalogName: CatalogName,
    culture: ApiCulture,
    entries: CatalogEntry[],
    timestamp: Date,
  ): Promise<void> {
    if (!this.pgClient)
      throw new Error('PostgreSQL client not initialized')

    await this.pgClient.query('BEGIN')

    try {
      // Clear existing entries for this catalog and culture
      await this.pgClient.query(
        'DELETE FROM catalog_cache WHERE catalog_name = $1 AND culture = $2',
        [catalogName, culture],
      )

      // Insert new entries
      for (const entry of entries) {
        await this.pgClient.query(`
          INSERT INTO catalog_cache 
          (catalog_name, culture, entry_id, entry_name, entry_name_plural, created_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (catalog_name, culture, entry_id) 
          DO UPDATE SET 
            entry_name = EXCLUDED.entry_name,
            entry_name_plural = EXCLUDED.entry_name_plural,
            created_at = EXCLUDED.created_at
        `, [
          catalogName,
          culture,
          entry.id,
          entry.name,
          entry.name_plurial || null,
          timestamp,
        ])
      }

      await this.pgClient.query('COMMIT')
    }
    catch (error) {
      await this.pgClient.query('ROLLBACK')
      throw error
    }
  }

  private getSqliteEntry(catalogName: CatalogName, culture: ApiCulture, id: number): CatalogEntryName | null {
    if (!this.sqliteDb)
      throw new Error('SQLite database not initialized')

    const row = this.sqliteDb.prepare(`
      SELECT entry_name, entry_name_plural, created_at
      FROM catalog_cache 
      WHERE catalog_name = ? AND culture = ? AND entry_id = ?
    `).get(catalogName, culture, id) as { entry_name: string, entry_name_plural: string | null, created_at: string } | undefined

    if (!row)
      return null

    const createdAt = new Date(row.created_at)
    const currentTime = Date.now()

    if (currentTime - createdAt.getTime() > this.cacheExpirationMs) {
      throw new CacheExpiredError()
    }

    return {
      name: row.entry_name,
      namePlural: row.entry_name_plural || undefined,
    }
  }

  private async getPostgresEntry(catalogName: CatalogName, culture: ApiCulture, id: number): Promise<CatalogEntryName | null> {
    if (!this.pgClient)
      throw new Error('PostgreSQL client not initialized')

    const result = await this.pgClient.query(`
      SELECT entry_name, entry_name_plural, created_at
      FROM catalog_cache 
      WHERE catalog_name = $1 AND culture = $2 AND entry_id = $3
    `, [catalogName, culture, id])

    if (result.rows.length === 0)
      return null

    const row = result.rows[0] as CacheRow
    const currentTime = Date.now()

    if (currentTime - row.created_at.getTime() > this.cacheExpirationMs) {
      throw new CacheExpiredError()
    }

    return {
      name: row.entry_name,
      namePlural: row.entry_name_plural || undefined,
    }
  }

  private getSqliteEntries(catalogName: CatalogName, culture: ApiCulture): CatalogEntry[] {
    if (!this.sqliteDb)
      throw new Error('SQLite database not initialized')

    const rows = this.sqliteDb.prepare(`
      SELECT entry_id, entry_name, entry_name_plural, created_at
      FROM catalog_cache 
      WHERE catalog_name = ? AND culture = ?
      ORDER BY entry_id
    `).all(catalogName, culture) as Array<{
      entry_id: number
      entry_name: string
      entry_name_plural: string | null
      created_at: string
    }>

    if (rows.length === 0) {
      throw new CacheExpiredError()
    }

    // Check if any entry is expired (we check the first one as they should all have similar timestamps)
    const firstCreatedAt = new Date(rows[0].created_at)
    const currentTime = Date.now()

    if (currentTime - firstCreatedAt.getTime() > this.cacheExpirationMs) {
      throw new CacheExpiredError()
    }

    return rows.map(row => ({
      id: row.entry_id,
      name: row.entry_name,
      name_plurial: row.entry_name_plural || undefined,
    }))
  }

  private async getPostgresEntries(catalogName: CatalogName, culture: ApiCulture): Promise<CatalogEntry[]> {
    if (!this.pgClient)
      throw new Error('PostgreSQL client not initialized')

    const result = await this.pgClient.query(`
      SELECT entry_id, entry_name, entry_name_plural, created_at
      FROM catalog_cache 
      WHERE catalog_name = $1 AND culture = $2
      ORDER BY entry_id
    `, [catalogName, culture])

    if (result.rows.length === 0) {
      throw new CacheExpiredError()
    }

    // Check if any entry is expired (we check the first one as they should all have similar timestamps)
    const firstRow = result.rows[0] as CacheRow
    const currentTime = Date.now()

    if (currentTime - firstRow.created_at.getTime() > this.cacheExpirationMs) {
      throw new CacheExpiredError()
    }

    return result.rows.map((row: any) => ({
      id: row.entry_id,
      name: row.entry_name,
      name_plurial: row.entry_name_plural || undefined,
    }))
  }
}
