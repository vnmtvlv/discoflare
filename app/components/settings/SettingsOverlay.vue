<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })
defineProps<{ labelledBy?: string }>()
const appConfig = useAppConfig()

function close() {
  open.value = false
}

defineShortcuts({
  escape: () => {
    if (open.value) close()
  },
})
</script>

<template>
  <UModal
    v-model:open="open"
    fullscreen
    :close="false"
    :dismissible="false"
    :ui="{
      overlay: 'bg-muted',
      content: 'divide-y-0 p-0 ring-0 shadow-none rounded-none bg-muted inset-0',
    }"
  >
    <template #content>
      <div class="h-dvh flex min-h-0" role="document">
        <div class="flex-1 flex justify-end bg-muted min-w-[192px]">
          <aside class="flex w-[192px] flex-col overflow-y-auto px-2 py-[60px] pe-1.5 sm:w-[218px]">
            <slot name="nav" />
            <p class="mt-auto px-2.5 pt-8 text-[11px] text-dimmed">Discoflare v{{ appConfig.version }}</p>
          </aside>
        </div>
        <div class="flex-[1_1_800px] flex min-w-0 bg-default">
          <div class="flex-1 max-w-[740px] min-w-0 py-[60px] px-6 sm:px-10 pb-24 overflow-y-auto">
            <slot />
          </div>
          <div class="w-14 sm:w-16 shrink-0 pt-[60px] pe-2 sm:pe-3">
            <button
              type="button"
              class="size-9 mx-auto rounded-full border-2 border-muted flex items-center justify-center text-muted hover:text-highlighted hover:border-default transition-colors"
              aria-label="Close"
              @click="close"
            >
              <UIcon name="i-ph-x" class="size-5" />
            </button>
            <p class="mt-1.5 text-[13px] font-bold text-muted text-center tracking-wide">ESC</p>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
