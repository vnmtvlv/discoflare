<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const session = useSessionStore()
const health = computed(() => session.health)

const missing = computed(() => {
  const bindings = health.value?.bindings
  const out: string[] = []
  if (bindings && !bindings.db) out.push('database')
  if (bindings && !bindings.r2) out.push('files')
  if (bindings && !bindings.kv) out.push('tickets')
  if (bindings && !bindings.channelDo) out.push('channel')
  if (bindings && !bindings.workspaceDo) out.push('workspace')
  if (bindings && !bindings.rateLimitDo) out.push('rate limit')
  if (bindings && !bindings.notificationDo) out.push('notifications')
  if (health.value && !health.value.migrated) out.push('migrations')
  return out
})

onMounted(async () => {
  await session.refresh()
  if (session.user) await navigateTo('/')
  else if (session.health?.users) await navigateTo('/login')
})
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold tracking-tight text-highlighted">Setup</h1>
    <UAlert
      v-if="missing.length"
      color="error"
      variant="subtle"
      :title="`Not ready: ${missing.join(', ')}`"
      class="mt-6"
    />
    <UAlert
      v-else-if="health && !health.adminEnv"
      color="warning"
      variant="subtle"
      title="Set ADMIN_EMAIL and ADMIN_PASSWORD, then redeploy."
      class="mt-6"
    />
    <UAlert
      v-else
      color="neutral"
      variant="subtle"
      title="Creating the owner from environment settings…"
      class="mt-6"
    />
    <UButton to="/login" size="lg" label="Sign in" block class="mt-8" />
  </div>
</template>
