<script setup lang="ts">
const props = defineProps<{
  files: File[]
}>()

const emit = defineEmits<{
  remove: [index: number]
}>()

type DraftPreview = {
  file: File
  url: string | null
}

const previews = shallowRef<DraftPreview[]>([])

function revokePreviews() {
  for (const preview of previews.value) {
    if (preview.url) URL.revokeObjectURL(preview.url)
  }
}

watch(() => props.files, (files) => {
  revokePreviews()
  previews.value = files.map(file => ({
    file,
    url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
  }))
}, { immediate: true })

onBeforeUnmount(revokePreviews)
</script>

<template>
  <div class="flex flex-wrap gap-2 px-3 pt-3" aria-label="Attachments ready to send">
    <div
      v-for="(preview, index) in previews"
      :key="`${preview.file.name}:${preview.file.lastModified}:${index}`"
      class="relative flex w-24 flex-col overflow-hidden rounded-lg bg-muted ring ring-default"
    >
      <img
        v-if="preview.url"
        :src="preview.url"
        :alt="preview.file.name"
        class="block aspect-square w-full bg-elevated object-contain"
      >
      <div v-else class="flex aspect-square w-full items-center justify-center">
        <UIcon name="i-ph-file" class="size-8 text-muted" />
      </div>
      <span class="truncate px-2 py-1.5 text-xs text-default" :title="preview.file.name">
        {{ preview.file.name }}
      </span>
      <UTooltip :text="`Remove ${preview.file.name}`">
        <UButton
          icon="i-ph-x"
          color="neutral"
          variant="solid"
          size="xs"
          square
          class="absolute end-1 top-1 rounded-full"
          :aria-label="`Remove ${preview.file.name}`"
          @click="emit('remove', index)"
        />
      </UTooltip>
    </div>
  </div>
</template>
