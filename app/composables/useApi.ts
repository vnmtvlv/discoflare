import { resolveServerUrl, resolveServerWebSocketUrl } from '~~/shared/client-router'

export function useApi() {
  const { native, activeOrigin } = useClientServers()
  const config = useRuntimeConfig()

  async function api<T>(url: string, opts?: Parameters<typeof $fetch>[1]) {
    const fetcher = import.meta.client && native ? globalThis.$fetch : $fetch
    return await fetcher<T>(url, opts)
  }

  function serverUrl(value: string) {
    return resolveServerUrl(value, native ? activeOrigin.value : null)
  }

  function socketUrl(path: string) {
    const currentOrigin = import.meta.client ? window.location.origin : 'http://localhost'
    const remoteOrigin = import.meta.client && typeof config.public.devRemoteOrigin === 'string'
      ? config.public.devRemoteOrigin || null
      : null
    return resolveServerWebSocketUrl(path, native ? activeOrigin.value : remoteOrigin, currentOrigin)
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
