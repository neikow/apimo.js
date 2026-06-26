import { z } from 'zod'

/**
 * A single catalog entry as stored in the cache.
 *
 * Catalogs are reference tables (property types, statuses, …) keyed by a numeric
 * id. The Apimo API returns localized `name`/`name_plurial` labels per `culture`.
 */
export const CatalogEntrySchema = z.object({
  id: z.number(),
  culture: z.string().optional(),
  name: z.string(),
  name_plurial: z.string().optional(),
})

export type CatalogEntry = z.infer<typeof CatalogEntrySchema>
