// Constants
export type { CatalogName } from './consts/catalogs'

export type { ApiCulture } from './consts/languages'
// Main exports
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
  ApiServerError,
  ApiUnauthorizedError,
} from './errors'

export type { ApimoAgency, ApimoPartner, ApimoRate } from './schemas/agency'

// Schema types
export type {
  ApimoCity,
  ApimoUser,
  CatalogDefinition,
  CatalogEntry,
  CatalogTransformer,
  LocalizedCatalogTransformer,
} from './schemas/common'

export type {
  ApimoAgreement,
  ApimoArea,
  ApimoComment,
  ApimoConstruction,
  ApimoFloor,
  ApimoHeating,
  ApimoPicture,
  ApimoPlot,
  ApimoPrice,
  ApimoProperty,
  ApimoRegulation,
  ApimoResidence,
  ApimoSurface,
  ApimoView,
  ApimoWater,
} from './schemas/property'

export { DummyCache } from './services/storage/dummy.cache'
export { FilesystemCache } from './services/storage/filesystem.cache'

// Cache adapters
export { MemoryCache } from './services/storage/memory.cache'
// Cache types and errors
export { type ApiCacheAdapter, CacheExpiredError, type CatalogEntryName } from './services/storage/types'

// Utility types
export type { DeepPartial } from './types'

export type { ApiSearchParams } from './utils/url'
