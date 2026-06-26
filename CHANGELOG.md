# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 2.0.0 — unreleased (BREAKING)

Apimo published an official **OpenAPI 3 specification**. This library now
**generates its HTTP client and runtime validation schemas from that spec**
(using [orval](https://orval.dev)) instead of maintaining hand-written Zod
schemas. The spec is vendored at `openapi/apimo-api3-en.yaml` and regenerated
with `yarn gen:api`.

This is a breaking change. Read the **Migration guide** below before upgrading a
project that depends on this package.

### Fixed

- **Production validation crash on `fetchProperties`.** Responses failed with:

  ```
  [properties.0.user.firstname] Invalid input: expected string, received undefined
  [properties.0.user.lastname]  Invalid input: expected string, received undefined
  [properties.0.user.language]  Invalid input: expected string, received undefined
  [properties.0.user.group]     Invalid input: expected number, received NaN
  [properties.0.user.email]     Invalid input: expected string, received undefined
  ```

  The old hand-written schema required these `user` fields. The OpenAPI spec
  defines **no `required` list** on the `User` object, so every field is now
  optional and a property whose negotiator omits these fields parses correctly.
  A regression test covers this (`src/core/api.test.ts`).

### Added

- Generated API client and Zod schemas under `src/generated/` (do not edit by hand).
- `orval.config.ts` and the vendored spec `openapi/apimo-api3-en.yaml`.
- `yarn gen:api` script to regenerate the client from the spec.
- `Apimo.fetchUsers(agencyId)` — lists an agency's users/negotiators.
- `Apimo.getCatalogEntry(catalogName, id, { culture })` — resolves a single
  catalog id to its localized `{ name, namePlural }` (cache-backed).
- Exported types `RetryConfig`, `BackoffStrategy`, `ApimoRequestContext`.

### Changed (breaking)

- **Response shapes now follow the OpenAPI spec**, and most fields are optional.
  For `fetchProperties` / `fetchAgencies` consumers specifically:
  - `property.user.*` is optional — null-guard before use.
  - **Catalog-backed fields are now raw numeric ids / enum literals, not
    `{ name, namePlural }` objects.** `type`, `subtype`, `category`, `step`,
    `status`, `condition`, `availability`, `heating`, `view`, etc. are numbers.
    Resolve human-readable names with `getCatalogEntry` / `getCatalogEntries`.
  - **Dates are ISO 8601 strings, not `Date` objects.** `created_at`,
    `updated_at`, `delivered_at`, … are strings now (the implicit
    `Converters.toDate` transform is gone). Wrap with `new Date(...)`.
  - `property.reference` is a `string` (per spec), previously a coerced number.
- **`Apimo` configuration changed:**
  - `catalogs.transform` is **removed** — the library no longer auto-translates
    catalog ids into names while parsing. `catalogs.cache` is unchanged.
  - `retry` keeps the same shape (`attempts`, `initialDelayMs`, `backoff`).
- **Removed the low-level `Apimo.fetch()` and `Apimo.get()` methods.** All HTTP
  now flows through the generated client and the custom mutator
  (`src/api/mutator.ts`), which preserves Basic auth, Bottleneck rate-limiting,
  retries/back-off, and the typed `Api*Error` mapping. Use the typed
  `fetch*` methods instead.
- **Type exports:** `ApimoProperty`, `ApimoUser`, `ApimoAgency` are retained as
  aliases of the generated `Property`, `User`, `Agency`. Several granular type
  aliases were re-pointed at generated equivalents
  (`ApimoPrice` → `PropertyPrice`, `ApimoComment` → `PropertyCommentsItem`,
  `ApimoPicture` → `PropertyPicturesItem`, …). `ApimoSurface`, `ApimoPlot`,
  `ApimoCity`, `ApimoPartner`, `ApimoRate` are removed — import the generated
  `Property*` types directly if needed.
- `culture` is only sent to catalog endpoints now (the spec does not define a
  `culture` query parameter on properties/agencies).

### Removed

- Hand-written schema files `src/schemas/property.ts`, `src/schemas/agency.ts`,
  `src/schemas/internal.ts`, and the transform plumbing from
  `src/schemas/common.ts` (`getUserSchema`, `CatalogTransformer`,
  `LocalizedCatalogTransformer`, `CatalogDefinition`, `NameIdPairSchema`,
  `CitySchema`).

### Migration guide (for downstream projects)

1. **Catalog names.** Anywhere you read `property.type.name` (etc.), resolve the
   id explicitly:
   ```ts
   const type = await api.getCatalogEntry('property_type', property.type, { culture: 'en' })
   // type?.name
   ```
   Catalog entries are still fetched once and cached (`getCatalogEntries`).

2. **Dates.** Replace direct `Date` usage with `new Date(value)`:
   ```ts
   const created = property.created_at ? new Date(property.created_at) : undefined
   ```

3. **Optional user fields.** Guard before use:
   ```ts
   const fullName = [property.user?.firstname, property.user?.lastname].filter(Boolean).join(' ')
   ```

4. **Config.** Drop `catalogs.transform`:
   ```diff
   - new Apimo(provider, token, { catalogs: { transform: { active: true } } })
   + new Apimo(provider, token)
   ```

5. **Low-level calls.** Replace any `api.get(...)` / `api.fetch(...)` usage with
   the typed methods (`fetchProperties`, `fetchAgencies`, `fetchCatalogs`,
   `fetchCatalog`, `fetchUsers`).

## 1.1.0

- Added database cache adapter.
