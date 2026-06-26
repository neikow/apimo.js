/**
 * Orval code generation for the Apimo Webservice API (v3).
 *
 * The OpenAPI specification is vendored under ./openapi so generation is
 * reproducible and offline. Regenerate with `yarn gen:api`.
 *
 * Orval is intentionally NOT a project dependency: the generated output under
 * `src/generated` is committed, so codegen is a rare, on-demand task run through
 * `npx` (see the `gen:api` script). This keeps the package installable on every
 * Node version the library supports — orval itself requires Node >= 22.18.
 *
 * Two targets are produced:
 *  - `apimo`    — a typed `fetch` client. All HTTP concerns (base URL, Basic
 *                 auth, rate-limiting, retries, error mapping) are delegated to
 *                 the custom mutator in ./src/api/mutator.ts.
 *  - `apimoZod` — Zod schemas mirroring the spec, used to validate responses at
 *                 runtime. The spec marks most object properties as optional
 *                 (no `required` lists), so the generated schemas are lenient by
 *                 design — this is intentional and matches what the API returns.
 *
 * @type {import('orval').Config}
 */
export default {
  apimo: {
    input: {
      target: './openapi/apimo-api3-en.yaml',
    },
    output: {
      mode: 'single',
      target: './src/generated/client/apimo.ts',
      schemas: './src/generated/client/model',
      client: 'fetch',
      baseUrl: '',
      clean: true,
      prettier: false,
      override: {
        mutator: {
          path: './src/api/mutator.ts',
          name: 'customFetch',
        },
      },
    },
  },
  apimoZod: {
    input: {
      target: './openapi/apimo-api3-en.yaml',
    },
    output: {
      mode: 'single',
      target: './src/generated/zod/apimo.zod.ts',
      client: 'zod',
      clean: true,
      prettier: false,
    },
  },
}
