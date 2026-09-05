<script setup lang="ts">
import { useWindowSize } from '@vueuse/core'

export type SettingsItem = {
  id: string
  label: string
  icon: string
  /** Extra terms the search box should match, for settings people look for by another name. */
  keywords?: string[]
}
export type SettingsGroup = { label?: string; items: SettingsItem[] }

const props = defineProps<{
  groups: SettingsGroup[]
  /** Shown above the nav — the account name or the workspace name. */
  title: string
}>()

const open = defineModel<boolean>('open', { default: false })
const section = defineModel<string>('section', { default: '' })

const appConfig = useAppConfig()
const { width } = useWindowSize()
const isMobile = computed(() => width.value > 0 && width.value < 768)

const query = ref('')
/** On mobile the two panes become two screens: pick a section, then read it. */
const mobileView = ref<'nav' | 'detail'>('nav')

const filtered = computed<SettingsGroup[]>(() => {
  const term = query.value.trim().toLowerCase()
  if (!term) return props.groups
  return props.groups
    .map(group => ({
      label: group.label,
      items: group.items.filter(item => [item.label, ...(item.keywords ?? [])]
        .some(value => value.toLowerCase().includes(term))),
    }))
    .filter(group => group.items.length)
})

const visibleItems = computed(() => filtered.value.flatMap(group => group.items))
const activeLabel = computed(() => props.groups
  .flatMap(group => group.items)
  .find(item => item.id === section.value)?.label ?? '')

function select(id: string) {
  section.value = id
  query.value = ''
  mobileView.value = 'detail'
}

/** Enter in the search box commits the only remaining match. */
function submitSearch() {
  const only = visibleItems.value[0]
  if (only && visibleItems.value.length === 1) select(only.id)
}

/** Up/Down walks the visible sections without leaving the keyboard. */
function step(delta: 1 | -1) {
  const items = visibleItems.value
  if (!items.length) return
  const index = items.findIndex(item => item.id === section.value)
  const next = items[Math.min(Math.max(index + delta, 0), items.length - 1)]
  if (next) section.value = next.id
}

function close() {
  open.value = false
}

watch(open, (value) => {
  if (!value) return
  query.value = ''
  mobileView.value = isMobile.value ? 'nav' : 'detail'
})

watch(isMobile, (value) => {
  if (!value) mobileView.value = 'detail'
})

defineShortcuts({
  escape: () => {
    if (!open.value) return
    if (isMobile.value && mobileView.value === 'detail') mobileView.value = 'nav'
    else close()
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
      <div
        class="flex h-dvh min-h-0 pb-[var(--df-safe-area-bottom)] pt-[var(--df-safe-area-top)]"
        role="document"
      >
        <div
          class="min-w-0 flex-1 justify-end bg-muted md:flex md:min-w-[192px] md:flex-none"
          :class="isMobile && mobileView === 'detail' ? 'hidden' : 'flex'"
        >
          <aside class="flex w-full flex-col overflow-y-auto px-2 pb-6 pe-1.5 pt-6 md:w-[192px] md:py-[60px] lg:w-[218px]">
            <div class="flex items-center gap-1 px-1 pb-3 md:hidden">
              <h1 class="min-w-0 flex-1 truncate text-lg font-semibold text-highlighted">Settings</h1>
              <UButton icon="i-ph-x" color="neutral" variant="ghost" square aria-label="Close settings" @click="close" />
            </div>
            <p class="mb-2 truncate px-2.5 text-[11px] font-bold uppercase tracking-wide text-muted">{{ title }}</p>

            <UInput
              v-model="query"
              icon="i-ph-magnifying-glass"
              placeholder="Search settings"
              autocomplete="off"
              size="sm"
              class="mb-2 px-0.5"
              :ui="{ root: 'w-full' }"
              aria-label="Search settings"
              @keydown.enter.prevent="submitSearch"
              @keydown.down.prevent="step(1)"
              @keydown.up.prevent="step(-1)"
            />

            <p v-if="!filtered.length" class="px-2.5 py-3 text-sm text-muted">
              Nothing matches “{{ query }}”.
            </p>

            <template v-for="(group, index) in filtered" :key="group.label ?? index">
              <template v-if="group.label">
                <USeparator v-if="index" class="my-3" />
                <p class="mb-1 px-2.5 text-[11px] font-bold uppercase tracking-wide text-muted">{{ group.label }}</p>
              </template>
              <nav class="space-y-0.5" :class="!group.label && index ? 'mt-3' : ''">
                <button
                  v-for="item in group.items"
                  :key="item.id"
                  type="button"
                  class="flex h-11 w-full items-center gap-2 rounded-md px-2.5 text-start text-sm md:h-8"
                  :class="section === item.id
                    ? 'bg-accented text-highlighted'
                    : 'text-muted hover:bg-elevated hover:text-default'"
                  :aria-current="section === item.id ? 'page' : undefined"
                  @click="select(item.id)"
                >
                  <UIcon :name="item.icon" class="size-[18px] shrink-0" />
                  <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
                  <UIcon v-if="isMobile" name="i-ph-caret-right" class="size-4 shrink-0 text-dimmed" />
                </button>
              </nav>
            </template>

            <div class="mt-auto pt-8">
              <slot name="footer" />
              <p class="px-2.5 pt-4 text-[11px] text-dimmed">Discoflare v{{ appConfig.version }}</p>
            </div>
          </aside>
        </div>

        <div
          class="min-w-0 flex-1 bg-default md:flex md:flex-[1_1_800px]"
          :class="isMobile && mobileView === 'nav' ? 'hidden' : 'flex'"
        >
          <div class="min-w-0 flex-1 overflow-y-auto px-4 pb-24 pt-4 sm:px-10 md:max-w-[740px] md:py-[60px]">
            <div class="mb-4 flex items-center gap-1 md:hidden">
              <UButton
                icon="i-ph-arrow-left"
                color="neutral"
                variant="ghost"
                square
                aria-label="Back to settings list"
                @click="mobileView = 'nav'"
              />
              <span class="min-w-0 flex-1 truncate text-sm text-muted">{{ activeLabel }}</span>
              <UButton icon="i-ph-x" color="neutral" variant="ghost" square aria-label="Close settings" @click="close" />
            </div>
            <slot />
          </div>
          <div class="hidden w-14 shrink-0 pe-2 pt-[60px] md:block sm:w-16 sm:pe-3">
            <button
              type="button"
              class="mx-auto flex size-9 items-center justify-center rounded-full border-2 border-muted text-muted transition-colors hover:border-default hover:text-highlighted"
              aria-label="Close settings"
              @click="close"
            >
              <UIcon name="i-ph-x" class="size-5" />
            </button>
            <p class="mt-1.5 text-center text-[13px] font-bold tracking-wide text-muted">ESC</p>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
