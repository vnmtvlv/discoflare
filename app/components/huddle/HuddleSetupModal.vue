<script setup lang="ts">
const ui = useUiStore()
</script>

<template>
  <UModal v-model:open="ui.huddleSetupOpen" title="Huddles need RealtimeKit">
    <template #body>
      <ol class="text-sm list-decimal pl-5 space-y-1 text-muted">
        <li>Open the <ULink to="https://dash.cloudflare.com/?to=/:account/realtime/kit" target="_blank">RealtimeKit dashboard</ULink> and create an app.</li>
        <li>Create a Voice preset (and optionally an A/V preset).</li>
        <li>Set secrets (do not paste a global API token into this UI):</li>
      </ol>
      <pre class="text-xs bg-muted p-3 rounded overflow-auto mt-3">wrangler secret put REALTIMEKIT_ACCOUNT_ID
wrangler secret put REALTIMEKIT_APP_ID
wrangler secret put REALTIMEKIT_API_KEY
wrangler secret put REALTIMEKIT_PRESET_VOICE</pre>
      <p class="text-xs text-muted mt-2">Optional: REALTIMEKIT_API_SECRET and REALTIMEKIT_PRESET_AV.</p>
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" label="Close" @click="ui.huddleSetupOpen = false" />
    </template>
  </UModal>
</template>
