// Retry / request types
export type { ApimoRequestContext, BackoffStrategy, RetryConfig } from './api/mutator'

// Constants
export type { CatalogName } from './consts/catalogs'

export type { ApiCulture } from './consts/languages'

// Main client
export { type AdditionalConfig, Apimo, DEFAULT_ADDITIONAL_CONFIG, DEFAULT_BASE_URL } from './core/api'
// Backward compatibility - keep Api as alias
export { Apimo as Api } from './core/api'

// Errors
export {
  ApiBadRequestError,
  ApiConfigurationError,
  ApiForbiddenError,
  ApiHttpError,
  ApimoError,
  ApiNotFoundError,
  ApiRateLimitError,
  ApiResponseValidationError,
  ApiRetryExhaustedError,
  ApiServerError,
  ApiUnauthorizedError,
} from './errors'

// Domain types — generated from the vendored OpenAPI spec (src/generated).
// The `Apimo*` aliases preserve the names exported by previous versions.
export type {
  Agency as ApimoAgency,
  PropertyAgreement as ApimoAgreement,
  PropertyArea as ApimoArea,
  PropertyCommentsItem as ApimoComment,
  PropertyConstruction as ApimoConstruction,
  Contact as ApimoContact,
  PropertyFloor as ApimoFloor,
  PropertyHeating as ApimoHeating,
  Lead as ApimoLead,
  PropertyPicturesItem as ApimoPicture,
  PropertyPrice as ApimoPrice,
  Property as ApimoProperty,
  PropertyRegulationsItem as ApimoRegulation,
  Request as ApimoRequest,
  PropertyResidence as ApimoResidence,
  User as ApimoUser,
  PropertyView as ApimoView,
  PropertyWater as ApimoWater,
} from './generated/client/model'

// Catalog entry shape (cache layer)
export type { CatalogEntry } from './schemas/common'

// Cache adapters
export { DummyCache } from './services/storage/dummy.cache'
export { FilesystemCache } from './services/storage/filesystem.cache'
export { MemoryCache } from './services/storage/memory.cache'

// Cache types and errors
export { type ApiCacheAdapter, CacheExpiredError, type CatalogEntryName } from './services/storage/types'

// Utility types
export type { DeepPartial } from './types'
export type { ApiSearchParams } from './utils/url'
