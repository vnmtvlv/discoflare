export default defineNuxtRouteMiddleware(async (to) => {
  const session = useSessionStore()
  const { api, native } = useApi()
  if (!session.ready) {
    if (import.meta.client && native) await session.refresh(api)
    else await session.refresh(asSessionFetcher(useRequestFetch()))
  }
  if (!session.user) {
    return navigateTo({ path: '/login', query: { next: to.fullPath } })
  }
})
