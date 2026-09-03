export default defineNuxtRouteMiddleware(async (to) => {
  const session = useSessionStore()
  if (!session.ready) await session.refresh(useRequestFetch())
  if (!session.user) {
    return navigateTo({ path: '/login', query: { next: to.fullPath } })
  }
})
