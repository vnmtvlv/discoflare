<template>
  <div class="flex h-full flex-col justify-center font-mono text-xs sm:text-sm">
    <div class="mb-4 flex gap-2 text-dimmed">
      <span class="size-2.5 rounded-full bg-error" />
      <span class="size-2.5 rounded-full bg-warning" />
      <span class="size-2.5 rounded-full bg-success" />
    </div>
    <p class="text-muted"><span class="text-primary">$</span> Deploying Discoflare</p>
    <p class="mt-3 text-toned">✓ Worker uploaded</p>
    <p class="mt-2 text-toned">✓ D1 database connected</p>
    <p class="mt-2 text-toned">✓ R2 and KV connected</p>
    <p class="mt-2 text-toned">✓ Durable Objects ready</p>
    <p class="mt-4 text-success">Your workspace is live.</p>
  </div>
</template>
