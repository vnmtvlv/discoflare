<template>
  <div class="flex h-full flex-col">
    <div class="mb-5 flex items-center justify-between border-b border-muted pb-4">
      <div class="flex items-center gap-2">
        <UIcon name="i-ph-hash" class="text-muted" />
        <strong class="text-sm">product-launch</strong>
      </div>
      <span class="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
        <UIcon name="i-ph-robot" class="size-3" />
        Member
      </span>
    </div>

    <div class="flex flex-1 flex-col justify-center gap-3.5">
      <div class="max-w-[88%] rounded-xl bg-muted p-3 text-xs leading-5 text-toned">
        <span class="font-medium text-primary">@releasebot</span> what is still unresolved here?
      </div>

      <div class="ml-auto max-w-[92%] rounded-xl border border-primary/25 bg-primary/10 p-3 text-xs leading-5 text-toned">
        <div class="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-highlighted">
          <UIcon name="i-ph-robot" class="size-3.5 text-primary" />
          releasebot
        </div>
        Two review comments are open and the changelog entry is missing.
      </div>

      <div class="ml-6 flex items-center gap-2 text-xs text-muted">
        <UIcon name="i-ph-cube" />
        Answered from this channel's own memory
      </div>
    </div>
  </div>
</template>
