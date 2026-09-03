<script setup lang="ts">
import { channelPath } from '~~/shared/paths'

definePageMeta({ middleware: ['auth'] })
const ui = useUiStore()
const { workspaceId } = useWorkspace()

onMounted(async () => {
  const last = ui.last()
  if (last?.channelId) {
    await navigateTo(`/channels/${last.channelId}`, { replace: true })
    return
  }
  if (!workspaceId.value) return
  const { channels } = await $fetch<{ channels: Array<{ id: string; name: string; type: string }> }>(`/api/workspaces/${workspaceId.value}/channels`)
  const first = channels.find((c) => c.type === 'text') ?? channels[0]
  if (first) await navigateTo(channelPath(first), { replace: true })
})
</script>

<template>
  <div class="flex-1 flex items-center justify-center text-muted text-sm">Opening channel…</div>
</template>
