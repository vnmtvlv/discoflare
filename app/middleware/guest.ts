export default defineNuxtRouteMiddleware(async () => {
  const session = useSessionStore()
  if (!session.ready) await session.refresh(useRequestFetch())
  if (session.user) return navigateTo('/')
})
