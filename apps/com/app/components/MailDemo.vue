<template>
  <div class="flex h-full flex-col">
    <div class="mb-5 flex items-center justify-between border-b border-muted pb-4">
      <div class="flex items-center gap-2">
        <UIcon name="i-ph-envelope-simple" class="text-muted" />
        <strong class="text-sm">support@yourdomain.com</strong>
      </div>
      <span class="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">Shared mailbox</span>
    </div>

    <div class="flex flex-1 flex-col justify-center gap-3.5">
      <div class="max-w-[88%] rounded-xl bg-muted p-3 text-xs leading-5 text-toned">
        <div class="mb-1.5 text-xs font-medium text-highlighted">dana@acme.co</div>
        Can we move the renewal call to Thursday?
      </div>

      <div class="ml-auto flex max-w-[92%] items-start gap-2 rounded-xl border border-primary/25 bg-primary/10 p-3 text-xs leading-5 text-toned">
        <UIcon name="i-ph-lock-simple" class="mt-0.5 size-3.5 shrink-0 text-primary" />
        <span><span class="font-medium text-highlighted">Internal note</span> — Dana is on the enterprise trial, loop in Maya before replying.</span>
      </div>

      <div class="ml-6 flex items-center gap-2 text-xs text-muted">
        <UIcon name="i-ph-hash" />
        The mailbox is a channel. The conversation is a thread.
      </div>
    </div>
  </div>
</template>
