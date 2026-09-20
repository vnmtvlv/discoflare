<script setup lang="ts">
import { channelPath } from '~~/shared/paths'

definePageMeta({ middleware: ['auth'] })
const ui = useUiStore()
const { workspaceId } = useWorkspace()
const { api } = useApi()

onMounted(() => {
  let stop = () => {}
  stop = watch(workspaceId, async (id) => {
    if (!id) return
    const last = ui.last()
    if (last?.channelId) {
      stop()
      await navigateTo(`/channels/${last.channelId}`, { replace: true })
      return
    }
    const { channels } = await api<{ channels: Array<{ id: string; name: string; type: string }> }>(`/api/workspaces/${id}/channels`)
    const first = channels.find((c) => c.type === 'text') ?? channels[0]
    if (first) {
      stop()
      await navigateTo(channelPath(first), { replace: true })
    }
  }, { immediate: true })
})
</script>

<template>
  <div class="flex-1 flex items-center justify-center text-muted text-sm">Opening channel…</div>
</template>
