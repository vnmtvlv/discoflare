import { useQuery } from '@tanstack/vue-query'
import type { GuildDTO } from '~~/shared/types'

export function useWorkspace() {
  const guildsQ = useQuery({
    queryKey: ['guilds'],
    queryFn: () => $fetch<{ guilds: GuildDTO[] }>('/api/guilds'),
  })
  const guild = computed(() => guildsQ.data.value?.guilds[0] ?? null)
  const guildId = computed(() => guild.value?.id ?? '')
  return { guildsQ, guild, guildId }
}
