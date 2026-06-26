/**
 * Post-processes the orval-generated Zod schemas to tolerate what the live
 * Apimo API actually returns, which the vendored OpenAPI spec does not describe
 * faithfully. Run automatically after `orval` by the `gen:api` script.
 *
 * The spec is stricter than reality on three axes; each is loosened here:
 *
 *  1. Dates. The spec types date fields as `date-time`, so orval emits
 *     `zod.iso.datetime(...)` / `zod.iso.date()`. The API returns
 *     `YYYY-MM-DD HH:MM:SS` (no `T`, no offset) — see the field descriptions,
 *     which literally document that format. We treat dates as plain strings.
 *
 *  2. Scalar types. The API serialises numbers as strings (and a few strings,
 *     e.g. `reference`, as numbers). We coerce number / string / boolean so the
 *     representation no longer matters.
 *
 *  3. Nullability. The spec marks fields optional but not nullable, while the
 *     API sends `null` for "no value". Every `.optional()` becomes `.nullish()`
 *     so `null` is accepted and preserved as `null` (not coerced to `0`/`""`).
 *
 * The transform is deterministic and idempotent against a fresh orval run, so
 * regenerating (`yarn gen:api`) always reproduces the committed output.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ZOD_FILE = fileURLToPath(new URL('../src/generated/zod/apimo.zod.ts', import.meta.url))

const TRANSFORMS = [
  // 1. Dates → lenient strings (API format is not ISO 8601).
  [/zod\.iso\.datetime\([^)]*\)/g, 'zod.string()'],
  [/zod\.iso\.date\(\)/g, 'zod.string()'],
  // Loosen branded string formats the API does not strictly honour.
  [/zod\.email\(\)/g, 'zod.string()'],
  [/zod\.url\(\)/g, 'zod.string()'],
  // 2. Coerce scalars so string/number representation mismatches don't fail.
  [/zod\.number\(\)/g, 'zod.coerce.number()'],
  [/zod\.string\(\)/g, 'zod.coerce.string()'],
  [/zod\.boolean\(\)/g, 'zod.coerce.boolean()'],
  // 3. Accept (and preserve) null wherever the spec only said "optional".
  [/\.optional\(\)/g, '.nullish()'],
]

const original = readFileSync(ZOD_FILE, 'utf8')
let output = original

for (const [pattern, replacement] of TRANSFORMS) {
  const before = output
  output = output.replaceAll(pattern, replacement)
  const count = (before.match(pattern) ?? []).length
  console.info(`  ${pattern.source} → ${replacement}: ${count}`)
}

if (output !== original) {
  writeFileSync(ZOD_FILE, output)
  console.info('Patched src/generated/zod/apimo.zod.ts for live-API leniency.')
}
else {
  console.info('No changes applied (already lenient?).')
}
