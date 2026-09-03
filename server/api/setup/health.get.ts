import { realtimekitConfigured } from '../../../workers/realtimekit'
import { ensureAdminFromEnv, readAdminEnv } from '../../utils/bootstrap'
import { cf } from '../../utils/cf'
import { ensureMigrated, userCount } from '../../utils/db'
import type { SetupHealth } from '../../../shared/types'

export default defineEventHandler(async (event): Promise<SetupHealth> => {
  let env
  try {
    env = cf(event).env
  }
  catch {
    return {
      ok: false,
      users: 0,
      migrated: false,
      adminEnv: false,
      bindings: { db: false, r2: false, kv: false, channelDo: false, guildDo: false, rateLimitDo: false },
      realtimekit: false,
    }
  }

  const bindings = {
    db: Boolean(env.DB),
    r2: Boolean(env.FILES),
    kv: Boolean(env.SESSIONS),
    channelDo: Boolean(env.CHANNEL_DO),
    guildDo: Boolean(env.GUILD_DO),
    rateLimitDo: Boolean(env.RATE_LIMIT_DO),
  }

  let migrated = false
  let users = 0
  if (env.DB) {
    try {
      migrated = await ensureMigrated(env.DB)
      users = (await ensureAdminFromEnv(event)).users
    }
    catch {
      try {
        users = await userCount(env.DB)
      }
      catch {
        users = 0
      }
    }
  }

  if (env.FILES) {
    try {
      await env.FILES.head('__health__')
    }
    catch {
      // head of missing key still proves the binding works on most runtimes
    }
  }

  return {
    ok: bindings.db && migrated,
    users,
    migrated,
    adminEnv: Boolean(readAdminEnv(env)),
    bindings,
    realtimekit: realtimekitConfigured(env),
  }
})
