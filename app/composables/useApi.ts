export function useApi() {
  async function api<T>(url: string, opts?: Parameters<typeof $fetch>[1]) {
    return await $fetch<T>(url, opts)
  }
  return { api }
}

export function errorMessage(err: unknown): string {
  if (typeof err === 'object' && err && 'data' in err) {
    const data = (err as { data?: { error?: { message?: string } } }).data
    if (data?.error?.message) return data.error.message
  }
  if (err instanceof Error) return err.message
  return 'Something went wrong'
}
