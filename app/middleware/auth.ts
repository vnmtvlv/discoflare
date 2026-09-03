export default defineNuxtRouteMiddleware((to) => {
  const session = useSessionStore()
  if (!session.user) {
    return navigateTo({ path: '/login', query: { next: to.fullPath } })
  }
})
