<script setup lang="ts">
defineProps<{
  eyebrow: string
  title: string
  description: string
  icon: string
  reverse?: boolean
  videoSrc?: string
}>()

const videoFailed = ref(false)
</script>

<template>
  <article class="grid items-center gap-10 py-16 lg:grid-cols-2 lg:gap-20 lg:py-24">
    <div :class="reverse ? 'lg:order-2' : ''">
      <div class="mb-5 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <UIcon :name="icon" class="size-6" />
      </div>
      <p class="mb-3 text-sm font-medium text-primary">{{ eyebrow }}</p>
      <h2 class="display-title text-3xl font-semibold text-highlighted sm:text-4xl">{{ title }}</h2>
      <p class="mt-5 max-w-xl text-base leading-7 text-muted sm:text-lg">{{ description }}</p>
    </div>

    <div :class="reverse ? 'lg:order-1' : ''" class="relative">
      <div class="orange-glow absolute -inset-16 -z-10 blur-2xl" />
      <video
        v-if="videoSrc && !videoFailed"
        :src="videoSrc"
        autoplay
        muted
        loop
        playsinline
        class="aspect-video w-full rounded-2xl border border-default bg-elevated object-cover shadow-xl"
        @error="videoFailed = true"
      />
      <div v-else class="min-h-[17rem] overflow-hidden rounded-2xl border border-default bg-elevated p-5 shadow-xl sm:aspect-video sm:min-h-0 sm:p-7">
        <slot />
      </div>
    </div>
  </article>
</template>
