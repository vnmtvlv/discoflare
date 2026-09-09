<script setup lang="ts">
withDefaults(defineProps<{
  title?: string
}>(), {
  title: 'Verify this step',
})
</script>

<template>
  <aside class="not-prose my-6 flex gap-3 rounded-xl border border-success/25 bg-success/5 p-4 sm:p-5">
    <UIcon name="i-ph-check-circle" class="mt-0.5 size-5 shrink-0 text-success" />
    <div class="min-w-0">
      <p class="font-medium text-highlighted">{{ title }}</p>
      <div class="mt-1 text-sm leading-6 text-muted [&_a]:text-primary [&_a:hover]:underline [&_code]:rounded [&_code]:bg-elevated [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-toned [&_p+p]:mt-2">
        <slot />
      </div>
    </div>
  </aside>
</template>
