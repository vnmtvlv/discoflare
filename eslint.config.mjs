import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  { ignores: ['**/worker-configuration.d.ts'] },
  {
  rules: {
    'vue/multi-word-component-names': 'off',
    '@typescript-eslint/no-explicit-any': 'error',
  },
  },
)
