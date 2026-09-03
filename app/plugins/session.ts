export default defineNuxtPlugin(async () => {
  const session = useSessionStore()
  if (!session.ready) await session.refresh(useRequestFetch())
})
