<script setup lang="ts">
const route = useRoute()
const { servers, activeOrigin, select } = useClientServers()

function initials(name: string) {
  return name.trim().slice(0, 2).toUpperCase() || 'DF'
}

function activate(origin: string) {
  if (origin !== activeOrigin.value) select(origin)
  window.location.assign('/')
}
</script>

<template>
  <nav class="flex h-dvh w-16 shrink-0 flex-col items-center gap-2 border-e border-default bg-elevated px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))]">
    <UTooltip
      v-for="server in servers"
      :key="server.origin"
      :text="server.name"
      :content="{ side: 'right' }"
    >
      <button
        type="button"
        class="relative flex size-11 items-center justify-center rounded-2xl bg-accented text-sm font-semibold text-highlighted transition-all hover:rounded-xl hover:bg-primary hover:text-inverted"
        :class="server.origin === activeOrigin ? 'rounded-xl bg-primary text-inverted' : ''"
        :aria-label="server.name"
        :aria-current="server.origin === activeOrigin ? 'page' : undefined"
        @click="activate(server.origin)"
      >
        <span v-if="server.origin === activeOrigin" class="absolute -start-2 h-7 w-1 rounded-e-full bg-primary" />
        {{ initials(server.name) }}
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
