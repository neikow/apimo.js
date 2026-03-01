# Apimo.js

[![npm version](https://badge.fury.io/js/apimo.js.svg)](https://badge.fury.io/js/apimo.js)
[![CI](https://github.com/Neikow/apimo.js/actions/workflows/ci.yml/badge.svg)](https://github.com/Neikow/apimo.js/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/Neikow/apimo.js/branch/main/graph/badge.svg)](https://codecov.io/gh/Neikow/apimo.js)

A comprehensive TypeScript wrapper for the [Apimo API](https://apimo.net/en/api/webservice/) with intelligent caching,
rate limiting, and automatic catalog transformation for building custom Real Estate websites.

## Disclaimer

This library is still in development but no major breaking changes are expected. Use with caution in production.
The main missing features are typing of some API responses and more robust error handling.

## Features

- 🚀 **TypeScript-first** - Full type safety with Zod schema validation
- 📦 **Smart Caching** - Multiple cache adapters (Memory, Filesystem, Dummy) with automatic invalidation
- 🔄 **Rate Limiting** - Built-in request throttling to respect API limits (1000 requests/day)
- 🌍 **Multi-language Support** - Automatic catalog transformation for localized content
- 🏗️ **Property & Agency APIs** - Complete coverage of Apimo's real estate endpoints
- ⚡ **Optimized Performance** - Intelligent catalog caching reduces API calls by 90%

## Installation

```bash
npm install apimo.js
# or
yarn add apimo.js
```

## Quick Start

```typescript
import { Apimo } from 'apimo.js'

const api = new Apimo(
  'YOUR_BRIDGE_ID', // Get from Apimo support
  'YOUR_API_TOKEN', // Get from Apimo support
  {
    culture: 'en', // Default language
    catalogs: {
      cache: {
        active: true,
        adapter: new MemoryCache() // or FilesystemCache()
      }
    }
  }
)

// Fetch properties with automatic catalog transformation
const properties = await api.getProperties({
  limit: 10,
  offset: 0
})

// Get a specific property
const property = await api.getProperty(123)

// Fetch agencies
const agencies = await api.getAgencies()
```

## Configuration

### Basic Configuration

```typescript
const api = new Apimo(bridgeId, token, {
  baseUrl: 'https://api.apimo.pro', // API base URL
  culture: 'en', // Default language (en, fr)
  catalogs: {
    cache: {
      active: true, // Enable catalog caching
      adapter: new MemoryCache() // Cache implementation
    },
    transform: {
      active: true, // Enable catalog transformation
      transformFn: customTransformer // Optional custom transformer
    }
  }
})
```

### Cache Adapters

#### Memory Cache (Default)

```typescript
import { MemoryCache } from 'apimo.js'

const api = new Apimo(bridgeId, token, {
  catalogs: {
    cache: {
      adapter: new MemoryCache()
    }
  }
})
```

#### Filesystem Cache

```typescript
import { FilesystemCache } from 'apimo.js'

const api = new Apimo(bridgeId, token, {
  catalogs: {
    cache: {
      adapter: new FilesystemCache('./cache')
    }
  }
})
```

#### Dummy Cache (No Caching)

```typescript
import { DummyCache } from 'apimo.js'

const api = new Apimo(bridgeId, token, {
  catalogs: {
    cache: {
      adapter: new DummyCache()
    }
  }
})
```

## API Reference

### Properties

#### `getProperties(options?)`

Fetch a list of properties with optional filtering.

```typescript
const properties = await api.getProperties({
  limit: 20,
  offset: 0,
  culture: 'fr',
  // Add property filters as needed
})
```

#### `getProperty(id, options?)`

Fetch a specific property by ID.

```typescript
const property = await api.getProperty(123, {
  culture: 'en'
})
```

### Agencies

#### `getAgencies(options?)`

Fetch a list of agencies.

```typescript
const agencies = await api.getAgencies({
  limit: 10,
  culture: 'fr'
})
```

#### `getAgency(id, options?)`

Fetch a specific agency by ID.

```typescript
const agency = await api.getAgency(456)
```

### Catalogs

#### `fetchCatalogs()`

Get all available catalog definitions.

```typescript
const catalogs = await api.fetchCatalogs()
```

#### `fetchCatalog(catalogName, options?)`

Fetch entries for a specific catalog.

```typescript
const propertyTypes = await api.fetchCatalog('property_type', {
  culture: 'en'
})
```

#### `getCatalogEntries(catalogName, options?)`

Get catalog entries from cache (populates cache if needed).

```typescript
const entries = await api.getCatalogEntries('property_category', {
  culture: 'fr'
})
```

### Low-level API

#### `get(path, schema, options?)`

Make a direct API call with schema validation.

```typescript
import { z } from 'zod'

const customSchema = z.object({
  id: z.number(),
  name: z.string()
})

const result = await api.get(['custom', 'endpoint'], customSchema, {
  culture: 'en',
  limit: 10
})
```

#### `fetch(...args)`

Direct fetch with automatic authentication headers.

```typescript
const response = await api.fetch('https://api.apimo.pro/properties')
```

## Data Transformation

Apimo.js automatically transforms catalog IDs into human-readable names:

```typescript
// Raw API response
const rawResponse = {
  type: 1,
  category: 2
}

// Transformed response
const transformedResponse = {
  type: 'House',
  category: 'Sale'
}
```

### Custom Transformers

```typescript
async function customTransformer(catalogName, culture, id) {
  // Your custom transformation logic
  return await myCustomCatalogLookup(catalogName, culture, id)
}

const api = new Apimo(bridgeId, token, {
  catalogs: {
    transform: {
      active: true,
      transformFn: customTransformer
    }
  }
})
```

## Rate Limiting

The library includes built-in rate limiting to respect Apimo's API limits:

- **10 requests per second** (configurable)
- **Automatic queuing** of excess requests
- **Bottleneck integration** for advanced rate limiting scenarios

## Error Handling

```typescript
try {
  const properties = await api.getProperties()
}
catch (error) {
  if (error instanceof CacheExpiredError) {
    // Handle cache expiration
  }
  else {
    // Handle other API errors
    console.error('API Error:', error.message)
  }
}
```

## TypeScript Support

Full TypeScript support with comprehensive type definitions:

```typescript
import type { Agency, CatalogEntry, Property } from 'apimo.js'

const property: Property = await api.getProperty(123)
const agency: Agency = await api.getAgency(456)
```

## Supported Languages

- English (`en`)
- French (`fr`)

More languages can be added based on Apimo API support.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development

```bash
# Install dependencies
yarn install

# Run tests
yarn test

# Run tests with coverage
yarn test-coverage

# Run linting
yarn lint

# Build the package
yarn build
```

## License

MIT License - see the [LICENSE](LICENSE) file for details.

## Getting API Credentials

To use this library, you need:

1. **Bridge ID** - Your site identifier (string of numbers)
2. **API Token** - Secret token for authentication

Contact [Apimo customer service](https://apimo.net/en/contact/) to request your credentials.

## Currently Missing Features

- [ ] **Hardened error handling**: More robust error handling for API responses
- [ ] **Exported types & schemas**: Export all internal types & schemas for better TypeScript integration & validation
- [ ] **Minified build**: Smaller production build size
- [ ] **Documentation for all methods**: Complete API documentation for all available methods
- [ ] **More comprehensive tests**: Additional test coverage for edge cases

## Support

- 📖 [Apimo API Documentation](https://apimo.net/en/api/webservice/)
- 🐛 [Issue Tracker](https://github.com/Neikow/apimo.js/issues)
- 💬 [Discussions](https://github.com/Neikow/apimo.js/discussions)

---

Made with ❤️ by [Vitaly Lysen](https://lysen.dev)
