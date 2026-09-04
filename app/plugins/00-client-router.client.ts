export default defineNuxtPlugin(() => {
  const { native, activeOrigin, initialize } = useClientServers()
  if (!native) return

  initialize()
  if (!activeOrigin.value) return

  globalThis.$fetch = globalThis.$fetch.create({
    baseURL: activeOrigin.value,
    credentials: 'include',
    headers: { 'x-discoflare-client': 'native' },
  })
})
