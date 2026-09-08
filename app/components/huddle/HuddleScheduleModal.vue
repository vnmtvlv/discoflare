<script setup lang="ts">
const props = defineProps<{
  open: boolean
  channelId: string
  conversationName: string
  kind: 'call' | 'huddle'
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'created': []
}>()

const { api } = useApi()
const title = ref('')
const startsAt = ref('')
const saving = ref(false)
const error = ref<string | null>(null)

watch(() => props.open, (open) => {
  if (!open) return
  const initial = new Date(Date.now() + 30 * 60_000)
  initial.setSeconds(0, 0)
  startsAt.value = new Date(initial.getTime() - initial.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
  title.value = ''
  error.value = null
})

async function create() {
  const start = new Date(startsAt.value)
  if (!startsAt.value || Number.isNaN(start.getTime())) return
  saving.value = true
  error.value = null
  try {
    await api(`/api/channels/${props.channelId}/huddles`, {
      method: 'POST',
      body: { title: title.value.trim(), startsAt: start.toISOString() },
    })
    emit('created')
    emit('update:open', false)
  }
  catch (cause) {
    error.value = errorMessage(cause)
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    :open="open"
    :title="`Schedule ${kind}`"
    :description="`Plan it in ${conversationName}. Everyone who can open this conversation can join.`"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div class="space-y-4">
        <UFormField label="Title">
          <UInput v-model="title" class="w-full" placeholder="Weekly sync" autofocus />
        </UFormField>
        <UFormField label="Starts">
          <UInput v-model="startsAt" class="w-full" type="datetime-local" />
        </UFormField>
        <UAlert v-if="error" color="error" variant="subtle" :title="error" />
      </div>
    </template>
    <template #footer>
      <UButton color="neutral" variant="ghost" label="Cancel" @click="emit('update:open', false)" />
      <UButton icon="i-ph-calendar-plus" :label="`Schedule ${kind}`" :loading="saving" :disabled="!startsAt" @click="create" />
    </template>
  </UModal>
</template>
