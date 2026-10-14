import { afterEach, describe, expect, it, vi } from 'vitest'
import { rewriteConsoleCreateTask, rewriteNodeTimersImports } from '../../nitro.runtime.mjs'
import { installCreateTaskGuard } from '../../server/shims/create-task-guard'
import { clearImmediate, setImmediate } from '../../server/shims/node-timers.mjs'
import { setImmediate as promisesSetImmediate } from '../../server/shims/node-timers-promises.mjs'
import { browserBindingFor, readBrowserMarkdown } from '../../workers/agent-browser'
import { chromiumQuickAction, resolveCdpWebSocketUrl, type CdpClient, type CdpEvent } from '../../workers/browser-cdp'
import {
  agentRuntimeConfigured,
  aiProvider,
  cloudflareNetwork,
  resolveAgentModelId,
} from '../../workers/env'
import { containersAvailable, installationCapabilities } from '../../workers/installation-capabilities'
import { modelForAgent } from '../../workers/ai-runtime'
import { sendWorkspaceEmail, workspaceEmailAvailable } from '../../workers/mail-transport'

const message = {
  from: 'login@example.com',
  to: ['person@example.net'],
  subject: 'Hello',
  text: 'World',
}

describe('node:timers shim', () => {
  it('runs setImmediate on the next timer turn and clears it', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const handle = setImmediate(fn, 'a')
    expect(fn).not.toHaveBeenCalled()
    clearImmediate(handle)
    vi.runAllTimers()
    expect(fn).not.toHaveBeenCalled()
    setImmediate(fn, 'b')
    vi.runAllTimers()
    expect(fn).toHaveBeenCalledWith('b')
    vi.useRealTimers()
  })

  it('resolves timers/promises setImmediate without the runtime helper', async () => {
    await expect(promisesSetImmediate('ready')).resolves.toBe('ready')
  })

  it('rewrites a leftover worker-entry import onto a sibling module', () => {
    const source = 'import{setImmediate as q,clearImmediate as U}from"node:timers";'
    const rewritten = rewriteNodeTimersImports(source, 'index.mjs')
    expect(rewritten.code).toBe('import{setImmediate as q,clearImmediate as U}from"./celld-timers.mjs";')
    expect([...rewritten.needed]).toEqual(['celld-timers.mjs'])
  })

  it('rewrites nested chunks without collapsing the promises specifier', () => {
    const source = 'import{setTimeout}from"node:timers/promises";import{setImmediate}from\'node:timers\';'
    const rewritten = rewriteNodeTimersImports(source, 'chunks/nitro/nitro.mjs')
    expect(rewritten.code).toBe(
      'import{setTimeout}from"../../celld-timers-promises.mjs";import{setImmediate}from\'../../celld-timers.mjs\';',
    )
    expect([...rewritten.needed].sort()).toEqual(['celld-timers-promises.mjs', 'celld-timers.mjs'])
  })

  it('leaves an already aliased shim import alone', () => {
    const source = 'import{s as t}from"../_/node-timers-shim.mjs"'
    expect(rewriteNodeTimersImports(source, 'chunks/nitro/nitro.mjs').code).toBe(source)
  })
})

describe('console.createTask guard', () => {
  const original = Object.getOwnPropertyDescriptor(console, 'createTask')

  afterEach(() => {
    if (original) Object.defineProperty(console, 'createTask', original)
    else delete (console as { createTask?: unknown }).createTask
  })

  it('replaces a throwing createTask with a no-op factory', () => {
    Object.assign(console, {
      createTask: () => {
        throw new Error('not implemented')
      },
    })
    expect(installCreateTaskGuard()).toBe(true)
    const task = (console as { createTask: (name: string) => { run: (fn: () => number) => number } }).createTask('x')
    expect(task.run(() => 7)).toBe(7)
  })

  it('leaves a working createTask in place', () => {
    const createTask = vi.fn(() => ({ run: (fn: () => unknown) => fn() }))
    Object.assign(console, { createTask })
    expect(installCreateTaskGuard()).toBe(false)
    expect(createTask).toHaveBeenCalledWith('discoflare:probe')
  })

  it('rewrites hookable-style lookups and skips the guard module', () => {
    const source = 'const task = typeof console.createTask === "function" ? console.createTask : fallback'
    expect(rewriteConsoleCreateTask(source)).toContain('globalThis.__discoflareCreateTask')
    expect(rewriteConsoleCreateTask(source)).not.toContain('console.createTask')
    const guarded = `${source}\nconst marker = "__discoflareCreateTaskGuard"`
    expect(rewriteConsoleCreateTask(guarded)).toBe(guarded)
  })
})

describe('model provider fallback', () => {
  it('prefers Workers AI and otherwise requires the OpenAI-compatible trio', () => {
    expect(aiProvider({ AI: {}, AGENT_DO: {} } as never)).toBe('workers-ai')
    expect(aiProvider({
      AI_BASE_URL: 'https://llm.example.com/v1',
      AI_API_KEY: 'secret',
      AI_MODEL: 'your-model',
      AGENT_DO: {},
    } as never)).toBe('openai-compatible')
    expect(aiProvider({ AI_BASE_URL: 'https://llm.example.com/v1', AGENT_DO: {} } as never)).toBeNull()
    expect(agentRuntimeConfigured({ AI: {}, AGENT_DO: {} } as never)).toBe(true)
    expect(agentRuntimeConfigured({
      AI_BASE_URL: 'https://llm.example.com/v1/',
      AI_API_KEY: 'secret',
      AI_MODEL: 'your-model',
      AGENT_DO: {},
    } as never)).toBe(true)
    expect(agentRuntimeConfigured({ AGENT_DO: {} } as never)).toBe(false)
  })

  it('does not send a Workers AI model id to the compatible endpoint', () => {
    const env = {
      AI_BASE_URL: 'https://llm.example.com/v1',
      AI_API_KEY: 'secret',
      AI_MODEL: 'your-model',
    }
    expect(resolveAgentModelId(env as never, '@cf/moonshotai/kimi-k2.7-code')).toBe('your-model')
    expect(resolveAgentModelId(env as never, 'local-model')).toBe('local-model')
    expect(resolveAgentModelId({ AI: {} } as never, '')).toBe('@cf/moonshotai/kimi-k2.7-code')
  })

  it('returns a chat model object instead of a string when Workers AI is absent', () => {
    const model = modelForAgent({
      AI_BASE_URL: 'https://llm.example.com/v1',
      AI_API_KEY: 'secret',
      AI_MODEL: 'your-model',
    } as never)
    expect(typeof model).not.toBe('string')
    expect(modelForAgent({ AI: {}, AGENT_MODEL: 'custom' } as never)).toBe('custom')
  })
})

describe('mail gateways', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts JSON to an HTTP mail gateway when no email binding exists', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://mail.example.com/send')
      expect(init.headers).toMatchObject({ Authorization: 'Bearer mail-token' })
      expect(JSON.parse(String(init.body))).toEqual(message)
      return Response.json({ messageId: 'http-message' })
    })
    vi.stubGlobal('fetch', fetchMock)
    const env = { MAIL_GATEWAY_URL: 'https://mail.example.com/send', MAIL_GATEWAY_TOKEN: 'mail-token' } as never
    await expect(sendWorkspaceEmail(env, message)).resolves.toEqual({ messageId: 'http-message' })
    expect(workspaceEmailAvailable(env)).toBe(true)
  })

  it('accepts a string MAIL_GATEWAY and an SMTP gateway that relays the same JSON', async () => {
    const fetchMock = vi.fn(async (url: string) => Response.json({
      messageId: String(url).includes('smtp') ? 'smtp-message' : 'http-message',
    }))
    vi.stubGlobal('fetch', fetchMock)
    const env = {
      MAIL_GATEWAY: 'https://mail.example.com/send',
      SMTP_GATEWAY_URL: 'https://smtp.example.com/send',
      SMTP_GATEWAY_TOKEN: 'smtp-token',
      MAIL_GATEWAY_TOKEN: 'mail-token',
    } as never
    await expect(sendWorkspaceEmail(env, message)).resolves.toEqual({ messageId: 'http-message' })
    expect(fetchMock).toHaveBeenCalledWith('https://mail.example.com/send', expect.anything())

    const smtpOnly = { SMTP_GATEWAY_URL: 'https://smtp.example.com/send', SMTP_GATEWAY_TOKEN: 'smtp-token' } as never
    await expect(sendWorkspaceEmail(smtpOnly, message)).resolves.toEqual({ messageId: 'smtp-message' })
    expect(fetchMock).toHaveBeenLastCalledWith('https://smtp.example.com/send', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer smtp-token' }),
    }))
    expect(workspaceEmailAvailable({ SMTP_GATEWAY_URL: 'https://smtp.example.com/send' } as never)).toBe(false)
  })
})

describe('runtime capabilities', () => {
  it('turns calls and inbound email off away from Cloudflare and never enables containers', () => {
    expect(cloudflareNetwork({} as never)).toBe(true)
    expect(cloudflareNetwork({ DISCOFLARE_RUNTIME: 'cloudflare' } as never)).toBe(true)
    expect(cloudflareNetwork({ DISCOFLARE_RUNTIME: 'celld' } as never)).toBe(false)
    expect(containersAvailable()).toBe(false)
    const capabilities = installationCapabilities({
      DISCOFLARE_RUNTIME: 'celld',
      AI_BASE_URL: 'https://llm.example.com/v1',
      AI_API_KEY: 'secret',
      AI_MODEL: 'your-model',
      BROWSER_CDP_URL: 'http://127.0.0.1:9222',
      SMTP_GATEWAY_URL: 'https://smtp.example.com/send',
      SMTP_GATEWAY_TOKEN: 'smtp-token',
    } as never)
    expect(capabilities).toEqual({
      calls: false,
      containers: false,
      browser: 'cdp',
      emailOutbound: true,
      emailInbound: false,
    })
  })

  it('detects a celld user agent when the runtime var is unset', () => {
    vi.stubGlobal('navigator', { userAgent: 'celld/0.6.2' })
    expect(cloudflareNetwork({} as never)).toBe(false)
    expect(cloudflareNetwork({ DISCOFLARE_RUNTIME: 'workers' } as never)).toBe(true)
    vi.unstubAllGlobals()
  })
})

describe('Chromium DevTools fallback', () => {
  it('uses the binding first and a DevTools URL when the binding is absent', () => {
    const binding = { quickAction: vi.fn() }
    expect(browserBindingFor({ BROWSER: binding })).toBe(binding)
    expect(browserBindingFor({ BROWSER_CDP_URL: 'http://127.0.0.1:9222' })?.quickAction).toEqual(expect.any(Function))
    expect(browserBindingFor({})).toBeNull()
  })

  it('fails closed when neither browser is configured', async () => {
    await expect(readBrowserMarkdown({}, 'https://example.com/')).rejects.toThrow(/unavailable/i)
  })

  it('reads a DevTools websocket URL from /json/version', async () => {
    const fetcher = vi.fn(async () => Response.json({ webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/browser/1' }))
    await expect(resolveCdpWebSocketUrl('http://127.0.0.1:9222', fetcher as never)).resolves.toBe('ws://127.0.0.1:9222/devtools/browser/1')
    await expect(resolveCdpWebSocketUrl('wss://browser.internal/devtools')).resolves.toBe('wss://browser.internal/devtools')
  })

  it('drives markdown, links, and screenshots through CDP and closes the page', async () => {
    const calls: string[] = []
    const events: CdpEvent[] = []
    const client: CdpClient = {
      async send(method, params, sessionId) {
        calls.push(sessionId ? `${method}@${sessionId}` : method)
        if (method === 'Target.createTarget') return { targetId: 'target-1' }
        if (method === 'Target.attachToTarget') return { sessionId: 'session-1' }
        if (method === 'Page.navigate') events.push({ method: 'Page.loadEventFired', sessionId })
        if (method === 'Page.captureScreenshot') return { data: btoa('png') }
        if (method === 'Runtime.evaluate') {
          const expression = String(params?.expression)
          return { result: { value: expression.includes('querySelectorAll') ? ['https://example.com/a'] : 'Hello page' } }
        }
        return {}
      },
      async waitFor(predicate) {
        const event = events.find(predicate)
        if (!event) throw new Error('missing event')
      },
      async close() {
        calls.push('close')
      },
    }

    const markdown = await chromiumQuickAction(client, 'markdown', 'https://example.com/')
    expect(await markdown.json()).toEqual({ result: 'Hello page' })
    expect(calls).toContain('Target.closeTarget')
    const links = await chromiumQuickAction(client, 'links', 'https://example.com/')
    expect(await links.json()).toEqual({ result: ['https://example.com/a'] })
    const shot = await chromiumQuickAction(client, 'screenshot', 'https://example.com/')
    expect(shot.headers.get('content-type')).toBe('image/png')
    expect(new TextDecoder().decode(await shot.arrayBuffer())).toBe('png')
  })
})
