export default defineNuxtConfig({
  compatibilityDate: '2026-09-09',
  devtools: { enabled: false },
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  colorMode: {
    preference: 'dark',
    fallback: 'dark',
  },
  icon: {
    serverBundle: { collections: ['ph'] },
  },
  app: {
    head: {
      title: 'Discoflare Admin',
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#f6821f' },
        { name: 'robots', content: 'noindex, nofollow' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },
  runtimeConfig: {
    adminDevEmail: '',
    adminAccountId: '',
    adminAccountName: '',
    adminEmail: '',
    adminOrigin: '',
    adminWorkerName: '',
    workspaceManifestUrl: 'https://github.com/vnmtvlv/discoflare/releases/latest/download/discoflare-cloudflare-manifest.json',
  },
  nitro: {
    preset: 'cloudflare-module',
    cloudflare: {
      nodeCompat: true,
      deployConfig: false,
    },
    routeRules: {
      '/api/**': {
        headers: {
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
          'X-Frame-Options': 'DENY',
        },
      },
    },
    typescript: {
      tsConfig: {
        compilerOptions: { types: ['@cloudflare/workers-types'] },
      },
    },
  },
  typescript: {
    strict: true,
    tsConfig: {
      compilerOptions: { types: ['@cloudflare/workers-types'] },
    },
  },
})
