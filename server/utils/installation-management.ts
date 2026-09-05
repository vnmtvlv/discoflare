import type { DiscoflareEnv } from '../../workers/env'

export function managedInstallationOrigin(env: DiscoflareEnv, requestOrigin: string): string {
  const hostname = env.DISCOFLARE_APP_HOSTNAME?.trim()
  if (!hostname) return new URL(requestOrigin).origin
  const origin = new URL(`https://${hostname}`)
  if (origin.hostname !== hostname || origin.pathname !== '/') throw new Error('DISCOFLARE_APP_HOSTNAME is invalid')
  return origin.origin
}

export function managedUninstallUrl(origin: string, claim: string): string {
  const url = new URL('/uninstall', 'https://discoflare.com')
  url.searchParams.set('origin', new URL(origin).origin)
  url.hash = new URLSearchParams({ claim }).toString()
  return url.toString()
}

export async function emptyLiveFiles(bucket: R2Bucket): Promise<number> {
  let deleted = 0
  while (true) {
    const page = await bucket.list({ limit: 1_000 })
    const keys = page.objects.map(object => object.key)
    if (!keys.length) return deleted
    await bucket.delete(keys)
    deleted += keys.length
  }
}
