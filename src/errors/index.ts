import type { ZodError } from 'zod'

/**
 * Base class for all Apimo errors.
 * All errors thrown by the library extend this class, so you can catch them all with `catch (e) { if (e instanceof ApimoError) ... }`.
 */
export class ApimoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
  }
}

// ---------------------------------------------------------------------------
// HTTP / Network Errors
// ---------------------------------------------------------------------------

/**
 * Thrown when the Apimo API responds with a non-2xx HTTP status code.
 *
 * Prefer catching one of the more specific subclasses when you need to react
 * differently per status code.
 *
 * @example
 * ```ts
 * try {
 *   await api.fetchProperties(agencyId)
 * } catch (e) {
 *   if (e instanceof ApiHttpError) {
 *     console.error(`HTTP ${e.statusCode}: ${e.message}`)
 *   }
 * }
 * ```
 */
export class ApiHttpError extends ApimoError {
  constructor(
    /** The HTTP status code returned by the API. */
    public readonly statusCode: number,
    /** The human-readable error message, sourced from the response body when available. */
    message: string,
    /** The URL that was requested. */
    public readonly url: string,
    /** The raw response body, when it was possible to parse it. */
    public readonly responseBody?: unknown,
  ) {
    super(message)
  }
}

/**
 * Thrown when the request is malformed (HTTP 400).
 *
 * This usually indicates a bug in the library or invalid arguments passed to a method.
 */
export class ApiBadRequestError extends ApiHttpError {
  constructor(url: string, responseBody?: unknown) {
    super(400, 'Bad request: the server could not understand the request. Check that all parameters are valid.', url, responseBody)
  }
}

/**
 * Thrown when the provided credentials are invalid (HTTP 401).
 *
 * Verify that the `provider` and `token` passed to `new Apimo(...)` are correct.
 */
export class ApiUnauthorizedError extends ApiHttpError {
  constructor(url: string, responseBody?: unknown) {
    super(401, 'Unauthorized: invalid credentials. Verify your provider ID and token.', url, responseBody)
  }
}

/**
 * Thrown when the authenticated user does not have access to the requested resource (HTTP 403).
 *
 * This can happen when trying to access an agency or property that belongs to a different provider.
 */
export class ApiForbiddenError extends ApiHttpError {
  constructor(url: string, responseBody?: unknown) {
    super(403, 'Forbidden: you do not have permission to access this resource.', url, responseBody)
  }
}

/**
 * Thrown when the requested resource does not exist (HTTP 404).
 *
 * Double-check the agency ID or any other identifiers you are passing.
 */
export class ApiNotFoundError extends ApiHttpError {
  constructor(url: string, responseBody?: unknown) {
    super(404, 'Not found: the requested resource does not exist.', url, responseBody)
  }
}

/**
 * Thrown when the API rate limit has been exceeded (HTTP 429).
 *
 * The built-in `Bottleneck` limiter normally prevents this, but it can still
 * occur if multiple `Apimo` instances are running concurrently against the
 * same credentials.
 */
export class ApiRateLimitError extends ApiHttpError {
  constructor(url: string, responseBody?: unknown) {
    super(429, 'Rate limit exceeded: too many requests. Slow down and retry after a moment. You may have hit your daily limit.', url, responseBody)
  }
}

/**
 * Thrown when the Apimo API returns a server-side error (HTTP 5xx).
 *
 * This indicates a problem on Apimo's infrastructure; retrying after a delay is usually appropriate.
 */
export class ApiServerError extends ApiHttpError {
  constructor(statusCode: number, url: string, responseBody?: unknown) {
    super(statusCode, `Server error (${statusCode}): the Apimo API encountered an internal error. Try again later.`, url, responseBody)
  }
}

// ---------------------------------------------------------------------------
// Schema / Validation Errors
// ---------------------------------------------------------------------------

/**
 * Thrown when the response body does not match the expected schema.
 *
 * This most commonly happens when the Apimo API changes its response shape
 * without notice. The `zodError` property contains the full Zod validation
 * details to help you pinpoint the mismatch.
 *
 * @example
 * ```ts
 * } catch (e) {
 *   if (e instanceof ApiResponseValidationError) {
 *     console.error('Schema mismatch at', e.url)
 *     console.error(e.zodError.format())
 *   }
 * }
 * ```
 */
export class ApiResponseValidationError extends ApimoError {
  constructor(
    /** The URL that was requested. */
    public readonly url: string,
    /** The raw Zod error, containing detailed path/message information. */
    public readonly zodError: ZodError,
  ) {
    // Zod v4 uses `issues`; fall back to `errors` for Zod v3 compatibility.
    const issues: ZodError['issues'] = zodError.issues ?? (zodError as any).errors ?? []
    super(
      `Response validation failed for ${url}:\n${issues
        .map(e => `  - [${e.path.join('.')}] ${e.message}`)
        .join('\n')}`,
    )
  }
}

// ---------------------------------------------------------------------------
// Configuration Errors
// ---------------------------------------------------------------------------

/**
 * Thrown when the `Apimo` instance is configured incorrectly before any
 * network request is even made.
 *
 * @example
 * ```ts
 * } catch (e) {
 *   if (e instanceof ApiConfigurationError) {
 *     console.error('Fix your Apimo config:', e.message)
 *   }
 * }
 * ```
 */
export class ApiConfigurationError extends ApimoError {
  constructor(message: string) {
    super(`Configuration error: ${message}`)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps an HTTP status code to the most specific `ApiHttpError` subclass and
 * throws it.  Falls back to the generic `ApiHttpError` for unrecognised codes.
 *
 * @internal
 */
export function throwForStatus(statusCode: number, url: string, responseBody?: unknown): never {
  switch (statusCode) {
    case 400: throw new ApiBadRequestError(url, responseBody)
    case 401: throw new ApiUnauthorizedError(url, responseBody)
    case 403: throw new ApiForbiddenError(url, responseBody)
    case 404: throw new ApiNotFoundError(url, responseBody)
    case 429: throw new ApiRateLimitError(url, responseBody)
    default:
      if (statusCode >= 500) {
        throw new ApiServerError(statusCode, url, responseBody)
      }
      throw new ApiHttpError(statusCode, `HTTP error ${statusCode}`, url, responseBody)
  }
}
