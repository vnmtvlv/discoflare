import { hostedScriptName, hostedSlugFromHostname } from '../packages/admin-core/src/hosted-plan'

export type HostedDispatchEnv = {
  DISPATCHER: {
    get: (name: string) => { fetch: (request: Request) => Promise<Response> }
  }
  ROUTES?: {
    get: (key: string) => Promise<string | null>
  }
  HOSTED_APEX?: string
}

/** Route `slug.<apex>` to that workspace's user Worker. The apex itself is not a workspace. */
export async function routeHostedRequest(request: Request, env: HostedDispatchEnv): Promise<Response> {
  const apex = env.HOSTED_APEX?.trim()
  if (!apex) return new Response('Hosted routing is not configured', { status: 503 })
  const slug = hostedSlugFromHostname(new URL(request.url).hostname, apex)
  if (!slug) return new Response('Not found', { status: 404 })
  const status = await env.ROUTES?.get(`status:${slug}`)
  if (status === 'suspended') return new Response('This workspace is paused', { status: 402 })
  const script = (await env.ROUTES?.get(`script:${slug}`)) || hostedScriptName(slug)
  try {
    return await env.DISPATCHER.get(script).fetch(request)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.startsWith('Worker not found')) return new Response('Workspace not found', { status: 404 })
    throw error
  }
}

export default {
  fetch: routeHostedRequest,
}
