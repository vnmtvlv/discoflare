<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import type { ChannelFileDTO } from '~~/shared/types'
import AttachmentGallery from './AttachmentGallery.vue'

const props = defineProps<{
  channelId: string
}>()

const filesQ = useQuery({
  queryKey: computed(() => ['files', props.channelId]),
  queryFn: () => $fetch<{ files: ChannelFileDTO[] }>(`/api/channels/${props.channelId}/files`),
  enabled: computed(() => Boolean(props.channelId)),
})
</script>

<template>
  <div v-if="filesQ.isPending.value" class="p-3">
    <USkeleton class="h-24" />
  </div>
  <UAlert v-else-if="filesQ.error.value" color="error" title="Could not load files." class="m-3" />
  <p v-else-if="!filesQ.data.value?.files.length" class="p-3 text-sm text-muted">No files yet.</p>
  <div v-else class="px-3 pb-3">
    <AttachmentGallery :attachments="filesQ.data.value?.files ?? []" />
  </div>
</template>
