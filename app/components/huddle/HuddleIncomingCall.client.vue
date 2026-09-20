<script setup lang="ts">
const huddle = useHuddleStore()
</script>

<template>
  <UModal :open="Boolean(huddle.incoming)" :dismissible="false" :ui="{ content: 'sm:max-w-sm' }">
    <template #content>
      <div v-if="huddle.incoming" class="p-6 text-center">
        <div class="mx-auto grid size-16 place-items-center rounded-full bg-success/15 text-success">
          <UIcon name="i-ph-phone-incoming" class="size-8 animate-pulse" />
        </div>
        <h2 class="mt-4 text-lg font-semibold text-highlighted">{{ huddle.incoming.title }}</h2>
        <p class="mt-1 text-sm text-muted">{{ huddle.incoming.body }}</p>
        <div class="mt-6 flex justify-center gap-3">
          <UButton
            color="error"
            variant="soft"
            icon="i-ph-phone-disconnect"
            label="Decline"
            @click="huddle.incoming = null"
          />
          <UButton color="success" icon="i-ph-phone" label="Answer" @click="huddle.answerIncoming()" />
        </div>
      </div>
    </template>
  </UModal>
</template>
