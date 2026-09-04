<script setup lang="ts">
const route = useRoute()
const { servers, activeOrigin, select } = useClientServers()
const failedLogos = ref<string[]>([])

function logoUrl(origin: string) {
  return failedLogos.value.includes(origin)
    ? '/brand/logo-128.png'
    : `${origin}/brand/logo-128.png`
}

function useBundledLogo(origin: string) {
  if (!failedLogos.value.includes(origin)) failedLogos.value = [...failedLogos.value, origin]
}

function activate(origin: string) {
  if (origin !== activeOrigin.value) select(origin)
  window.location.assign('/')
}
</script>

<template>
  <nav class="flex h-full w-[var(--df-server-rail-width)] shrink-0 flex-col items-center gap-2 border-e border-default bg-elevated px-2 pb-[max(0.5rem,var(--df-safe-area-bottom))] pt-[max(0.5rem,var(--df-safe-area-top))]">
    <UTooltip
      v-for="server in servers"
      :key="server.origin"
      :text="server.name"
      :content="{ side: 'right' }"
    >
      <button
        type="button"
        class="relative flex size-11 items-center justify-center rounded-2xl bg-accented p-1.5 transition-all hover:rounded-xl hover:ring-2 hover:ring-primary"
        :class="server.origin === activeOrigin ? 'rounded-xl ring-2 ring-primary' : ''"
        :aria-label="server.name"
        :aria-current="server.origin === activeOrigin ? 'page' : undefined"
        @click="activate(server.origin)"
      >
        <span v-if="server.origin === activeOrigin" class="absolute -start-2 h-7 w-1 rounded-e-full bg-primary" />
        <img
          :src="logoUrl(server.origin)"
          alt=""
          width="32"
          height="32"
          decoding="async"
          draggable="false"
          class="size-8 shrink-0 select-none object-contain"
          @error="useBundledLogo(server.origin)"
        >
      </button>
    </UTooltip>

    <USeparator class="my-1 w-8" />
    <UTooltip text="Servers" :content="{ side: 'right' }">
      <UButton
        to="/servers"
        icon="i-ph-plus"
        color="neutral"
        :variant="route.path === '/servers' ? 'solid' : 'soft'"
        square
        size="lg"
        aria-label="Servers"
        class="rounded-2xl hover:rounded-xl"
      />
    </UTooltip>
  </nav>
</template>
