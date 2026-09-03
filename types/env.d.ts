/// <reference types="@cloudflare/workers-types" />
import type { DiscoflareEnv } from '../workers/env'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface CloudflareBindings extends DiscoflareEnv {}
}

export {}
