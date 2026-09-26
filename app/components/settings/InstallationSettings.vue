<script setup lang="ts">
/**
 * Everything about this installation on the owner's Cloudflare account, as one
 * nav entry with sub-tabs. Each tab keeps its own section id, so deep links like
 * `?section=backups` still land on the right tab.
 */
const props = defineProps<{
  workspaceId: string
  workspaceName: string
  updatesBehind?: number
}>()

const section = defineModel<string>('section', { required: true })

const tabs = computed(() => [
  { value: 'cloudflare', label: 'Overview' },
  { value: 'backups', label: 'Backups' },
  { value: 'updates', label: 'Updates', count: props.updatesBehind || undefined },
  { value: 'telemetry', label: 'Telemetry' },
  { value: 'danger', label: 'Delete' },
])
</script>

<template>
  <div>
    <LayoutSegmentedTabs v-model="section" :items="tabs" label="Installation settings" class="mb-8" />
    <SettingsCloudflareSettings v-if="section === 'cloudflare'" :workspace-id="workspaceId" />
    <SettingsBackupSettings v-else-if="section === 'backups'" :workspace-id="workspaceId" />
    <SettingsUpdateSettings v-else-if="section === 'updates'" :workspace-id="workspaceId" />
    <SettingsTelemetrySettings v-else-if="section === 'telemetry'" :workspace-id="workspaceId" />
    <SettingsDangerZoneSettings
      v-else-if="section === 'danger'"
      :workspace-id="workspaceId"
      :workspace-name="workspaceName"
      @backups="section = 'backups'"
    />
  </div>
</template>
