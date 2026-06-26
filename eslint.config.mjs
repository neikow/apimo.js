import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: [
    // Orval output — regenerated from the OpenAPI spec, never hand-edited.
    'src/generated/**',
  ],
})
