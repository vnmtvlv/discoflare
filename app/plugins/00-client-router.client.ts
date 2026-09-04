import { createLiveFetch } from '~~/shared/client-router'

export default defineNuxtPlugin(() => {
  const { native, activeOrigin, initialize } = useClientServers()
  if (!native) return

  initialize()
  const createFetch = globalThis.$fetch.create as (
    defaults: Parameters<typeof globalThis.$fetch.create>[0],
    runtime: { fetch: typeof globalThis.fetch },
  ) => typeof globalThis.$fetch
  globalThis.$fetch = createFetch({
    baseURL: activeOrigin.value ?? undefined,
    credentials: 'include',
    headers: { 'x-discoflare-client': 'native' },
  }, {
    // Resolve window.fetch per request so this instance uses Capacitor's
    // native-networking patch instead of retaining a browser fetch reference.
    fetch: createLiveFetch(),
  })
})
