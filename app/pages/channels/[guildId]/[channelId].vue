<script setup lang="ts">
import { channelPath } from '~~/shared/paths'

definePageMeta({ middleware: ['auth'] })
const route = useRoute()

onMounted(async () => {
  const id = String(route.params.channelId)
  try {
    const { channel } = await $fetch<{ channel: { id: string; name: string; type: string } }>(`/api/channels/${id}`)
    await navigateTo(channelPath(channel, route.params.threadId ? String(route.params.threadId) : undefined), { replace: true })
  }
  catch {
    await navigateTo('/channels', { replace: true })
  }
})
</script>

<template>
  <div class="flex-1 flex items-center justify-center text-muted text-sm">Opening channel…</div>
</template>
