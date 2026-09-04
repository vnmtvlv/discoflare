<script setup lang="ts">
import {
  DEFAULT_APP_NAME,
  DEFAULT_APP_SUBTITLE,
  DEFAULT_APP_TITLE,
} from '~~/shared/app-branding'

const session = useSessionStore()

const appName = computed(() => session.health?.appName || DEFAULT_APP_NAME)
const appTitle = computed(() => session.health?.appTitle || DEFAULT_APP_TITLE)
const appSubtitle = computed(() => session.health?.appSubtitle || DEFAULT_APP_SUBTITLE)
const appTitleLines = computed(() => appTitle.value
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(Boolean))

useHead(() => ({ title: appName.value }))
</script>

<template>
  <div class="min-h-dvh bg-default lg:grid lg:grid-cols-2">
    <aside class="auth-stage relative flex min-h-[22rem] flex-col overflow-hidden border-b border-default bg-elevated p-6 sm:min-h-[26rem] sm:p-8 lg:min-h-dvh lg:border-r lg:border-b-0 lg:p-10 xl:p-12">
      <BrandWordmark :name="appName" size="lg" class="relative z-10" />

      <div class="relative z-10 flex-1 flex items-center">
        <div class="max-w-lg">
          <h1 class="font-brand text-3xl sm:text-4xl xl:text-5xl font-semibold tracking-[-0.045em] text-highlighted leading-[1] break-words">
            <span
              v-for="(line, index) in appTitleLines"
              :key="`${index}-${line}`"
              class="block"
              :class="{ 'text-primary': appTitleLines.length > 1 && index === appTitleLines.length - 1 }"
            >{{ line }}</span>
          </h1>
          <p class="mt-7 max-w-md text-base xl:text-lg leading-relaxed text-muted">
            {{ appSubtitle }}
          </p>
        </div>
      </div>

      <div class="auth-shape auth-shape-one" aria-hidden="true" />
      <div class="auth-shape auth-shape-two" aria-hidden="true" />
      <div class="auth-shape auth-shape-three" aria-hidden="true" />
    </aside>

    <main class="flex min-h-[28rem] flex-col lg:min-h-dvh">
      <div class="flex-1 flex items-center justify-center px-6 py-12">
        <div class="w-full max-w-[400px]">
          <slot />
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.auth-stage {
  background-image: radial-gradient(
    circle,
    color-mix(in srgb, var(--ui-text-dimmed) 22%, transparent) 1px,
    transparent 1px
  );
  background-size: 28px 28px;
}

.auth-shape {
  position: absolute;
  border: 1px solid color-mix(in srgb, var(--ui-primary) 24%, transparent);
  background: color-mix(in srgb, var(--ui-primary) 12%, var(--ui-bg-elevated));
  box-shadow: inset 0 1px 0 color-mix(in srgb, white 12%, transparent);
}

.auth-shape-one {
  width: 18rem;
  height: 9rem;
  right: -6rem;
  top: 19%;
  border-radius: 4.5rem 1.5rem 4.5rem 4.5rem;
  transform: rotate(-11deg);
}

.auth-shape-two {
  width: 12rem;
  height: 6rem;
  left: -4rem;
  bottom: 13%;
  border-radius: 1.5rem 3rem 3rem 3rem;
  transform: rotate(14deg);
}

.auth-shape-three {
  width: 4.5rem;
  height: 4.5rem;
  right: 16%;
  bottom: 9%;
  border-radius: 42% 58% 61% 39% / 51% 38% 62% 49%;
  background: color-mix(in srgb, var(--ui-primary) 72%, var(--ui-bg-elevated));
  transform: rotate(24deg);
}
</style>
