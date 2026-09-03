<template>
  <div class="min-h-dvh bg-default lg:grid lg:grid-cols-[minmax(280px,40%)_1fr]">
    <aside class="relative hidden lg:flex flex-col p-10 xl:p-12 bg-elevated border-r border-default">
      <div class="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden="true" />
      <BrandWordmark size="lg" />
      <div class="flex-1 flex flex-col justify-center gap-8">
        <BrandLogo size="hero" alt="" priority />
        <p class="max-w-sm text-3xl xl:text-[2.125rem] font-medium tracking-tight text-highlighted leading-[1.15]">
          Chat that lives on your Cloudflare account.
        </p>
      </div>
    </aside>

    <main class="min-h-dvh flex flex-col">
      <div class="lg:hidden flex items-center gap-3 px-6 py-5 border-b border-default">
        <span class="w-1 h-5 bg-primary rounded-full" aria-hidden="true" />
        <BrandWordmark compact />
      </div>
      <div class="flex-1 flex items-center justify-center px-6 py-12">
        <div class="w-full max-w-[400px]">
          <slot />
        </div>
      </div>
    </main>
  </div>
</template>
