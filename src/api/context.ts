import type { ApimoRequestContext } from './mutator'
import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Carries the active {@link ApimoRequestContext} (credentials, base URL,
 * limiter, retry config) from an `Apimo` method call down into the
 * orval-generated client and its custom mutator, without a shared global.
 *
 * Lives in its own module so both `Apimo` (the producer) and the mutator
 * (the consumer) can import it without creating an import cycle.
 */
export const apimoRequestContext = new AsyncLocalStorage<ApimoRequestContext>()
