<script setup lang="ts">
import { WORKSPACE_ID } from '~~/shared/ids'
import type { PublicUser } from '~~/shared/types'

const props = defineProps<{
  user: Pick<PublicUser, 'id' | 'kind' | 'displayName' | 'avatarR2Key'>
}>()
const { serverUrl } = useApi()
const avatarSrc = computed(() => {
  if (props.user.kind === 'agent' && props.user.avatarR2Key) {
    const path = `/api/workspaces/${WORKSPACE_ID}/agents/${props.user.id}/avatar`
    return serverUrl(`${path}?v=${encodeURIComponent(props.user.avatarR2Key)}`)
  }
  return userAvatarSrc(props.user)
})
</script>

<template>
  <UAvatar
    :src="avatarSrc"
    :text="props.user.displayName.slice(0, 1).toUpperCase()"
    :alt="props.user.displayName"
  />
</template>
