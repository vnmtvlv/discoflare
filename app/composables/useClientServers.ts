import type { ClientMode, ClientServer } from '~~/shared/client-router'
import { normalizeServerOrigin } from '~~/shared/client-router'

const STORAGE_KEY = 'discoflare.client-servers.v1'

type StoredServers = {
  activeOrigin: string | null
  servers: ClientServer[]
}

export function useClientServers() {
  const config = useRuntimeConfig()
  const clientMode = config.public.clientMode as ClientMode
  // Kept as `native` for existing callers: it means a bundled client that
  // selects a remote server, including the Chrome extension shell.
  const native = clientMode !== 'web'
  const extension = clientMode === 'extension'
  const servers = useState<ClientServer[]>('client-servers', () => [])
  const activeOrigin = useState<string | null>('client-server-origin', () => null)
  const initialized = useState('client-servers-initialized', () => false)

  function persist() {
    if (!import.meta.client || !native) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      activeOrigin: activeOrigin.value,
      servers: servers.value,
    } satisfies StoredServers))
  }

  function initialize() {
    if (initialized.value || !import.meta.client || !native) return
    initialized.value = true
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const stored = JSON.parse(raw) as Partial<StoredServers>
      const normalized = (stored.servers ?? []).flatMap((server) => {
        try {
          return [{ origin: normalizeServerOrigin(server.origin), name: server.name?.trim() || new URL(server.origin).hostname }]
        }
        catch {
          return []
        }
      })
      servers.value = normalized
      activeOrigin.value = normalized.some(server => server.origin === stored.activeOrigin)
        ? stored.activeOrigin ?? null
        : normalized[0]?.origin ?? null
    }
    catch {
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  function add(server: ClientServer) {
    const origin = normalizeServerOrigin(server.origin)
    const next = { origin, name: server.name.trim() || new URL(origin).hostname }
    servers.value = [...servers.value.filter(item => item.origin !== origin), next]
    activeOrigin.value = origin
    persist()
  }

  function select(origin: string) {
    const normalized = normalizeServerOrigin(origin)
    if (!servers.value.some(server => server.origin === normalized)) return
    activeOrigin.value = normalized
    persist()
  }

  function remove(origin: string) {
    const normalized = normalizeServerOrigin(origin)
    servers.value = servers.value.filter(server => server.origin !== normalized)
    if (activeOrigin.value === normalized) activeOrigin.value = servers.value[0]?.origin ?? null
    persist()
  }

  return { clientMode, native, extension, servers, activeOrigin, initialize, add, select, remove }
}
