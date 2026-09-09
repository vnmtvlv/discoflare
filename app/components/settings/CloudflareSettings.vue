<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { InstallationManagementStatusDTO } from '~~/shared/releases'

const props = defineProps<{ workspaceId: string }>()

const toast = useToast()
const queryClient = useQueryClient()
const token = ref('')
const connecting = ref(false)
const disconnecting = ref(false)
const connectError = ref('')
const disconnectedTokenId = ref('')

const managementQ = useQuery({
  queryKey: computed(() => ['installation-management', props.workspaceId]),
  queryFn: () => $fetch<InstallationManagementStatusDTO>(`/api/workspaces/${props.workspaceId}/management`),
})

const status = computed(() => managementQ.data.value)

function errorMessage(cause: unknown, fallback: string) {
  const error = cause as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
  return error.data?.statusMessage || error.statusMessage || error.message || fallback
}

async function connect() {
  if (!token.value.trim()) return
  connecting.value = true
  connectError.value = ''
  disconnectedTokenId.value = ''
  try {
    await $fetch(`/api/workspaces/${props.workspaceId}/management`, {
      method: 'POST',
      body: { token: token.value },
    })
    token.value = ''
    await managementQ.refetch()
    await queryClient.invalidateQueries({ queryKey: ['updates', props.workspaceId] })
    toast.add({ title: 'Cloudflare management connected', color: 'success' })
  }
  catch (cause) {
    connectError.value = errorMessage(cause, 'Cloudflare management could not be connected.')
  }
  finally {
    connecting.value = false
  }
}

async function disconnect() {
  disconnecting.value = true
  connectError.value = ''
  try {
    const response = await $fetch<{ disconnected: true, tokenId: string }>(`/api/workspaces/${props.workspaceId}/management`, {
      method: 'DELETE',
    })
    disconnectedTokenId.value = response.tokenId
    await managementQ.refetch()
    await queryClient.invalidateQueries({ queryKey: ['updates', props.workspaceId] })
    toast.add({ title: 'Cloudflare management disconnected', color: 'success' })
  }
  catch (cause) {
    connectError.value = errorMessage(cause, 'Cloudflare management could not be disconnected.')
  }
  finally {
    disconnecting.value = false
  }
}
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold text-highlighted">Cloudflare</h1>
    <p class="mt-1 text-sm text-muted">Choose who can operate this installation after deployment.</p>

    <USkeleton v-if="managementQ.isPending.value" class="mt-8 h-48" />
    <UAlert
      v-else-if="managementQ.error.value"
      class="mt-8"
      color="error"
      title="Could not read installation management"
    />
    <UAlert
      v-else-if="!status?.available"
      class="mt-8"
      color="neutral"
      title="Manual deployment"
      description="This Worker does not contain the guided-installation identity required for in-workspace Cloudflare management."
    />

    <template v-else-if="status">
      <div class="mt-8 rounded-lg border border-default bg-elevated p-5">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p class="text-sm font-medium text-highlighted">{{ status.hostname }}</p>
            <p class="mt-1 text-sm text-muted">Worker: {{ status.workerName }}</p>
          </div>
          <UBadge
            :label="status.managementMode === 'managed' ? 'Connected' : 'Manual'"
            :color="status.managementMode === 'managed' ? 'success' : 'neutral'"
            variant="subtle"
          />
        </div>

        <template v-if="status.managementMode === 'managed'">
          <div class="mt-6 grid gap-3 border-t border-default pt-5 sm:grid-cols-2">
            <div class="rounded-md border border-default p-4">
              <p class="text-sm font-medium text-highlighted">Huddles</p>
              <p class="mt-1 text-sm text-muted">{{ status.huddlesEnabled ? 'RealtimeKit is connected.' : 'RealtimeKit needs attention.' }}</p>
            </div>
            <div class="rounded-md border border-default p-4">
              <p class="text-sm font-medium text-highlighted">Email</p>
              <p class="mt-1 text-sm text-muted">
                {{ status.emailEnabled ? `${status.emailDomain} is connected.` : 'No eligible domain was selected during installation.' }}
              </p>
            </div>
          </div>
          <div class="mt-5 flex flex-wrap items-center gap-3">
            <UButton
              label="Disconnect management"
              color="error"
              variant="outline"
              :loading="disconnecting"
              @click="disconnect"
            />
            <p class="text-xs text-muted">Huddles are disconnected; existing email routing keeps working.</p>
          </div>
        </template>

        <template v-else>
          <div class="mt-6 space-y-5 border-t border-default pt-5">
            <p class="text-sm leading-6 text-muted">
              Create one account-owned token in Cloudflare, then paste it here on your own workspace origin. The token is sent only to this Worker and stored as its secret; discoflare.com never receives it.
            </p>
            <UAlert
              color="warning"
              variant="subtle"
              title="This token controls the selected Cloudflare account"
              description="Use a separate account when you need installation-level isolation."
            />
            <div class="flex flex-wrap gap-2">
              <UButton
                v-if="status.tokenTemplateUrl"
                :to="status.tokenTemplateUrl"
                target="_blank"
                external
                label="Create Instance Admin Token"
                trailing-icon="i-ph-arrow-up-right"
                color="neutral"
                variant="outline"
              />
            </div>
            <UFormField label="Instance Admin Token" required hint="The value is shown once by Cloudflare.">
              <UInput v-model="token" type="password" autocomplete="off" class="w-full" />
            </UFormField>
            <p class="text-sm text-muted">
              Connecting enables self-updates and RealtimeKit Huddles{{ status.emailEligible && status.emailDomain ? `, and configures workspace email at ${status.emailDomain}` : '' }}.
            </p>
            <UButton label="Connect Cloudflare" :loading="connecting" :disabled="!token.trim()" @click="connect" />
          </div>
        </template>
      </div>

      <UAlert v-if="connectError" class="mt-4" color="error" title="Cloudflare operation failed" :description="connectError" />
      <UAlert
        v-if="disconnectedTokenId"
        class="mt-4"
        color="warning"
        title="Revoke the disconnected token in Cloudflare"
        :description="`Token ${disconnectedTokenId} is no longer stored by this Worker, but still exists in your Cloudflare account.`"
        :actions="[{ label: 'Open API tokens', to: 'https://dash.cloudflare.com/?to=/:account/api-tokens', target: '_blank' }]"
      />
    </template>
  </div>
</template>
