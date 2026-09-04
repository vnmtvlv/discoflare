import { resolveServerUrl, resolveServerWebSocketUrl } from '~~/shared/client-router'

export function useApi() {
  const { native, activeOrigin } = useClientServers()

  async function api<T>(url: string, opts?: Parameters<typeof $fetch>[1]) {
    return await $fetch<T>(url, opts)
  }

  function serverUrl(value: string) {
    return resolveServerUrl(value, native ? activeOrigin.value : null)
  }

  function socketUrl(path: string) {
    const currentOrigin = import.meta.client ? window.location.origin : 'http://localhost'
    return resolveServerWebSocketUrl(path, native ? activeOrigin.value : null, currentOrigin)
  }

  return { api, serverUrl, socketUrl, serverOrigin: activeOrigin, native }
}

export function errorMessage(err: unknown): string {
  if (typeof err === 'object' && err && 'data' in err) {
    const data = (err as { data?: { error?: { message?: string } } }).data
    if (data?.error?.message) return data.error.message
  }
  if (err instanceof Error) return err.message
  return 'Something went wrong'
}
