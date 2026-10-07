import { existsSync } from 'node:fs'
import type { E2EConfig } from 'e2e'
import { web } from '@e2e-dev/web'
import { openrouter } from '@openrouter/ai-sdk-provider'

const envFile = new URL('../../.env.e2e', import.meta.url)
if (existsSync(envFile)) process.loadEnvFile(envFile)

function requiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required; see docs/worker-previews.md#end-to-end-tests`)
  return value
}

export default {
  projectId: 'discoflare',
  workers: 1,
  retries: 0,
  timeout: 120_000,
  assertionTimeout: 15_000,
  cache: 'read-write',
  targets: [{
    name: 'chromium',
    engine: web({ browser: 'chromium' }),
    app: {
      url: requiredEnv('APP_URL'),
      identity: 'discoflare-worker-preview',
      environment: 'test',
    },
  }],
  credentials: {
    admin: {
      username: requiredEnv('E2E_USER_ADMIN_USERNAME'),
      password: requiredEnv('E2E_USER_ADMIN_PASSWORD'),
    },
  },
  ...(process.env.E2E_AI === '1'
    ? {
        agents: {
          default: {
            model: openrouter(process.env.E2E_MODEL?.trim() || 'openai/gpt-6-luna'),
            maxSteps: 8,
            maxModelCalls: 8,
            maxInputTokens: 16_000,
            context: 'Discoflare is team chat. The current channel is general. Send messages using the Message composer and Send message button. This is a disposable test workspace.',
          },
        },
      }
    : {}),
} satisfies E2EConfig
