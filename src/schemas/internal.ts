import { z } from 'zod'

export const TYPE_UNDOCUMENTED = z.unknown().transform((v) => {
  console.warn(`Unhandled undocumented field with value \`${v}\``)
  return v
})

export const TYPE_UNDOCUMENTED_NULLABLE = z.unknown().nullable().transform((v) => {
  if (v !== null) {
    console.warn(`Unhandled undocumented field with value \`${v}\``)
  }
  return v
})
