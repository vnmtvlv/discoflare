<script setup lang="ts">
import { renderMarkdown } from '~~/shared/markdown'

const props = defineProps<{
  content: string
  names?: Record<string, string>
}>()

const html = computed(() => renderMarkdown(props.content, props.names))
</script>

<template>
  <!-- markdown.ts escapes HTML and drops javascript: URLs -->
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="md break-words" v-html="html" />
</template>
