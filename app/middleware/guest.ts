export default defineNuxtRouteMiddleware(() => {
  const session = useSessionStore()
  if (session.user) return navigateTo('/')
})
