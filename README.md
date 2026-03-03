# Apimo.js

[![npm version](https://badge.fury.io/js/apimo.js.svg)](https://badge.fury.io/js/apimo.js)
[![CI](https://github.com/Neikow/apimo.js/actions/workflows/ci.yml/badge.svg)](https://github.com/Neikow/apimo.js/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/Neikow/apimo.js/branch/main/graph/badge.svg)](https://codecov.io/gh/Neikow/apimo.js)

A TypeScript-first wrapper for the [Apimo API](https://apimo.net/en/api/webservice/) with intelligent caching, automatic retries, rate limiting, and catalog transformation for building custom real estate websites.

> **Note:** This library is in active development. No breaking changes are planned, but please pin your version in production.

## Features

- 🔷 **TypeScript-first** — Full type safety with Zod schema validation on every response
- 📦 **Smart caching** — Memory, Filesystem, and Dummy cache adapters with automatic TTL invalidation
- 🔁 **Automatic retries** — Configurable retry strategy (exponential / linear / fixed back-off) for transient failures
- 🚦 **Rate limiting** — Built-in Bottleneck throttle to stay within Apimo's API limits
- 🌍 **Multi-language** — First-class `culture` support for all endpoints and catalog lookups
- 🏗️ **Full coverage** — Properties, agencies, and catalog endpoints
- 🐛 **Developer-friendly errors** — Typed error classes with status codes, request URLs, and response bodies

## Installation

```bash
npm install apimo.js
# or
yarn add apimo.js
```

## Quick Start

```typescript
import { Apimo, MemoryCache } from 'apimo.js'

const api = new Apimo(
  'YOUR_PROVIDER_ID', // Numeric string — request from Apimo support
  'YOUR_API_TOKEN', // Secret token — request from Apimo support
  {
    culture: 'en',
    catalogs: {
      cache: { active: true, adapter: new MemoryCache() },
    },
  },
)

const { properties } = await api.fetchProperties(agencyId)
const { agencies } = await api.fetchAgencies()
```

## Configuration

### Full Config Reference

```typescript
const api = new Apimo(providerId, token, {
  // Base URL for API requests. Default: 'https://api.apimo.pro'
  baseUrl: 'https://api.apimo.pro',

  // Default language for all requests. Default: 'en'
  culture: 'en',

  catalogs: {
    cache: {
      // Enable catalog caching. Default: true
      active: true,
      // Cache implementation. Default: new MemoryCache()
      adapter: new MemoryCache(),
    },
    transform: {
      // Resolve catalog IDs to human-readable names. Default: true
      active: true,
      // Optionally supply your own resolver function
      transformFn: async (catalogName, culture, id) => { /* ... */ },
    },
  },

  retry: {
    // Total number of attempts (1 = no retries). Default: 3
    attempts: 3,
    // Delay in ms before the first retry. Default: 200
    initialDelayMs: 200,
    // Back-off strategy: 'exponential' | 'linear' | 'fixed'. Default: 'exponential'
    backoff: 'exponential',
  },
})
```

### Cache Adapters

#### MemoryCache *(default)*

Stores catalog entries in process memory. Fast and zero-config. Data is lost when the process restarts.

```typescript
import { MemoryCache } from 'apimo.js'

const memoryCache = new MemoryCache({ cacheExpirationMs: 7 * 24 * 60 * 60 * 1000 }) // default: 1 week
```

#### FilesystemCache

Persists catalog entries to JSON files on disk. Survives restarts.

```typescript
import { FilesystemCache } from 'apimo.js'

const fsCache = new FilesystemCache({
  path: './cache/catalogs', // default
  cacheExpirationMs: 7 * 24 * 60 * 60 * 1000,
})
```

#### DatabaseCache

Persists catalog entries to a database (SQLite or PostgreSQL). Survives restarts and allows sharing cache across multiple instances.

> **Note**: Database dependencies are optional peer dependencies. You need to install them separately based on your database choice:
> - For SQLite: `npm install better-sqlite3`
> - For PostgreSQL: `npm install pg` (and optionally `npm install @types/pg` for TypeScript projects)

**SQLite:**
```typescript
import { DatabaseCache } from 'apimo.js'

// First install: npm install better-sqlite3
const sqliteCache = new DatabaseCache({
  type: 'sqlite',
  sqlite: {
    path: './cache/catalogs.db', // Database file path
  },
  cacheExpirationMs: 7 * 24 * 60 * 60 * 1000, // default: 1 week
})
```

**PostgreSQL:**
```typescript
import { DatabaseCache } from 'apimo.js'

// First install: npm install pg
const postgresCache = new DatabaseCache({
  type: 'postgres',
  postgres: {
    connectionString: 'postgresql://user:password@localhost:5432/apimo_cache',
    // OR individual connection parameters:
    // host: 'localhost',
    // port: 5432,
    // database: 'apimo_cache',
    // user: 'your_user',
    // password: 'your_password',
  },
  cacheExpirationMs: 7 * 24 * 60 * 60 * 1000,
})
```

#### DummyCache

Disables caching entirely. Every catalog look-up hits the API directly.

```typescript
import { DummyCache } from 'apimo.js'

const dummyCache = new DummyCache()
```

## API Reference

### Properties

#### `fetchProperties(agencyId, options?)`

```typescript
const { total_items, properties, timestamp } = await api.fetchProperties(agencyId, {
  culture: 'fr',
  limit: 20,
  offset: 0,
})
```

### Agencies

#### `fetchAgencies(options?)`

```typescript
const { total_items, agencies } = await api.fetchAgencies({ limit: 10 })
```

### Catalogs

#### `fetchCatalogs()`

Returns the list of all available catalog definitions.

```typescript
const catalogs = await api.fetchCatalogs()
```

#### `fetchCatalog(catalogName, options?)`

Fetches raw entries for a specific catalog.

```typescript
const entries = await api.fetchCatalog('property_type', { culture: 'en' })
```

#### `getCatalogEntries(catalogName, options?)`

Returns catalog entries, automatically populating the cache when empty or expired.

```typescript
const entries = await api.getCatalogEntries('property_category', { culture: 'fr' })
```

### Low-level API

#### `get(path, schema, options?)`

Makes a direct API call with Zod schema validation. Retries are applied automatically.

```typescript
import { z } from 'zod'

const result = await api.get(
  ['agencies', '123', 'properties'],
  z.object({ total_items: z.number() }),
  { culture: 'en', limit: 10 },
)
```

#### `fetch(...args)`

Raw authenticated fetch — adds the `Authorization` header and runs through the rate limiter. Use when you need full control.

```typescript
const response = await api.fetch('https://api.apimo.pro/catalogs')
```

## Error Handling

All errors thrown by the library extend `ApimoError`, so you can catch them selectively.

### Error Hierarchy

| Class | When thrown |
|---|---|
| `ApimoError` | Base class — catch-all |
| `ApiHttpError` | Any non-2xx HTTP response — has `.statusCode`, `.url`, `.responseBody` |
| `ApiBadRequestError` | HTTP 400 — malformed request |
| `ApiUnauthorizedError` | HTTP 401 — invalid credentials |
| `ApiForbiddenError` | HTTP 403 — insufficient permissions |
| `ApiNotFoundError` | HTTP 404 — resource does not exist |
| `ApiRateLimitError` | HTTP 429 — rate limit exceeded |
| `ApiServerError` | HTTP 5xx — Apimo server-side failure |
| `ApiResponseValidationError` | Response body doesn't match expected schema — has `.url`, `.zodError` |
| `ApiConfigurationError` | Invalid constructor arguments (empty credentials, bad `baseUrl`) |
| `ApiRetryExhaustedError` | All retry attempts failed — has `.attempts`, `.cause` |

### Retry behaviour

Retries are applied automatically to **transient** errors (429, 5xx, network failures). **Non-transient** errors (4xx except 429, schema validation failures) are thrown immediately without retrying.

When all attempts are exhausted, `ApiRetryExhaustedError` is thrown. Its `.cause` property holds the underlying error from the last attempt.

```typescript
import {
  ApimoError,
  ApiResponseValidationError,
  ApiRetryExhaustedError,
  ApiServerError,
  ApiUnauthorizedError,
  CacheExpiredError,
} from 'apimo.js'

try {
  const { properties } = await api.fetchProperties(agencyId)
}
catch (error) {
  if (error instanceof ApiUnauthorizedError) {
    // Credentials are wrong — fail fast, no retry
    console.error('Check your provider ID and token.')
  }
  else if (error instanceof ApiRetryExhaustedError) {
    // Transient failure survived all retries
    console.error(`Failed after ${error.attempts} attempts.`, error.cause)
  }
  else if (error instanceof ApiResponseValidationError) {
    // The API changed its response shape
    console.error('Schema mismatch:', error.zodError.format())
  }
  else if (error instanceof ApimoError) {
    // Any other library error
    console.error(error.message)
  }
}
```

### Disabling retries

```typescript
const api = new Apimo(providerId, token, {
  retry: { attempts: 1 }, // 1 attempt = no retries
})
```

## Data Transformation

When `catalogs.transform.active` is `true` (the default), numeric catalog IDs in API responses are automatically resolved to their human-readable names via the cache.

```typescript
// Without transformation:   { type: 1, category: 6 }
// With transformation:       { type: 'House', category: 'Sale' }
```

### Custom transformer

```typescript
const api = new Apimo(providerId, token, {
  catalogs: {
    transform: {
      active: true,
      transformFn: async (catalogName, culture, id) => {
        return await myDatabase.lookupCatalog(catalogName, culture, id)
      },
    },
  },
})
```

## Rate Limiting

The library uses [Bottleneck](https://github.com/SGrondin/bottleneck) internally to throttle requests to **10 per second** — well within Apimo's documented daily limits. No extra configuration is required.

## TypeScript

All public methods and types are fully typed. Import what you need:

```typescript
import type {
  AdditionalConfig,
  ApimoAgency,
  ApimoProperty,
  CatalogEntry,
} from 'apimo.js'
```

## Development

```bash
# Install dependencies
yarn install

# Run tests
yarn test

# Run tests with coverage
yarn test-coverage

# Lint
yarn lint

# Build
yarn build
```

## Getting API Credentials

You need two things to use this library:

1. **Provider ID** — a numeric string identifying your site
2. **API Token** — your secret authentication token

Request both by contacting [Apimo customer service](https://apimo.net/en/contact/).

## Roadmap

- [ ] Minified production build
- [ ] Complete JSDoc coverage for all public methods

## Support

- 📖 [Apimo API Documentation](https://apimo.net/en/api/webservice/)
- 🐛 [Issue Tracker](https://github.com/Neikow/apimo.js/issues)
- 💬 [Discussions](https://github.com/Neikow/apimo.js/discussions)

## License

MIT — see [LICENSE](LICENSE) for details.

---

Made with ❤️ by [Vitaly Lysen](https://lysen.dev)
