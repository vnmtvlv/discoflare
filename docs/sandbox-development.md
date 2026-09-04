# Sandbox development

`sandbox.discoflare.com` is a deployment of this repository, not a separate app. Local development can use its Cloudflare resources, but Discoflare needs a fully remote Wrangler preview to preserve the deployed Durable Object and WebSocket topology.

## Frontend against the deployed sandbox

For UI-only work, set the target in the ignored `.env` file:

```dotenv
DISCOFLARE_DEV_PROXY_ORIGIN=https://sandbox.discoflare.com
```

Then run the local Nuxt frontend while keeping the complete backend — including HTTP APIs and WebSockets — on that deployment:

```bash
pnpm dev:remote
```

The browser still talks to `http://localhost:3000/api/...` and `ws://localhost:3000/ws/...`; Nuxt proxies those requests to `DISCOFLARE_DEV_PROXY_ORIGIN`. This keeps cookies same-origin in the browser and rewrites the forwarded origin so the deployed server's CSRF check remains enabled.

The environment value can be overridden for one run:

```bash
pnpm dev:remote -- https://chat.example.com
```

This mode does not execute local server code and does not require Cloudflare credentials. Any writes affect the selected remote installation.

## Setup

1. Authenticate Wrangler interactively:

   ```bash
   pnpm exec wrangler login
   ```

   For non-interactive use, export a narrowly scoped, short-lived `CLOUDFLARE_API_TOKEN` in the shell. Never store Cloudflare login credentials in `.env.sandbox`; Wrangler passes dotenv values into the Worker environment.

2. Create the ignored local environment file:

   ```bash
   cp .env.sandbox.example .env.sandbox
   ```

3. Fill the account ID, deployed sandbox Worker name, D1 name and ID, R2 bucket name, KV namespace ID, and the sandbox `AUTH_SECRET`. Set `EMAIL_FROM` only when the account has an onboarded Email Service domain; the generated preview config then adds the restricted `EMAIL` binding. To exercise Web Push, also set the stable `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, and `VAPID_PRIVATE_KEY` used by that sandbox. No real IDs or secrets are committed.

4. Start the sandbox-resource-backed Worker preview:

   ```bash
   pnpm dev:sandbox
   ```

The command validates the environment, verifies Wrangler authentication, builds Nuxt with `.env.sandbox`, creates an ignored Wrangler config under `.wrangler/discoflare-sandbox/`, and starts `wrangler dev --remote` at `http://localhost:3000`. Use this mode when changing server or Worker code; use `pnpm dev:remote` for frontend-only work.

The command never applies D1 migrations, seeds data, or deploys a permanent Worker version. Rerun it after changing Nuxt source; Wrangler watches the generated Worker output, not the original Nuxt source tree.

## What is remote

- API and Worker code execute in a temporary Cloudflare preview, reached through localhost.
- D1, R2, and KV point at the deployed sandbox resources.
- `CHANNEL_DO`, `WORKSPACE_DO`, `RATE_LIMIT_DO`, and `NOTIFICATION_DO` point at the namespaces exported by the deployed sandbox Worker. Those objects therefore run the deployed sandbox Durable Object code; deploy the notification class and its migration before using a preview that binds it.
- Static assets come from the current local build.

All D1, R2, KV, Durable Object, and RealtimeKit writes affect the real pilot sandbox and may incur normal Cloudflare usage charges. Treat `pnpm dev:sandbox` as production-data access scoped to the disposable sandbox, not as an isolated test environment.

## Why not ordinary local remote bindings?

Cloudflare supports per-binding remote connections for D1, R2, and KV while Worker code runs locally. It does not support a direct remote Durable Object binding in that mode. Without the remote preview, Discoflare would run local Durable Objects against remote storage: localhost users would have separate presence, sockets, broadcasts, and rate-limit state from users on `sandbox.discoflare.com`.

Wrangler's remote development mode supports D1, R2, KV, and Durable Objects, so it is the consistent option for this app. It is slower than `pnpm dev`, uploads code to a temporary preview environment, adds network latency, and mutates the selected remote resources.

## Authentication and OAuth

Use the same `AUTH_SECRET` as the deployed sandbox. Existing sandbox login rows live in the shared D1 database, while browser cookies remain origin-scoped, so logging in at localhost does not copy the browser session from `sandbox.discoflare.com`.

OAuth is optional locally. For any provider configured in `.env.sandbox`, register its localhost callback:

```text
http://localhost:3000/api/auth/callback/github
http://localhost:3000/api/auth/callback/twitter
http://localhost:3000/api/auth/callback/telegram
```

Deployment-managed credentials override the encrypted values stored in the shared sandbox D1 database. `AUTH_REGISTRATION_MODE=open` only seeds a missing settings row; later owner changes in the UI win.

## Sources

- [Cloudflare Workers: local development and remote bindings](https://developers.cloudflare.com/workers/local-development/)
- [Cloudflare Workers: supported bindings per development mode](https://developers.cloudflare.com/workers/local-development/bindings-per-env/)
- [Cloudflare Workers: Wrangler environments and dotenv files](https://developers.cloudflare.com/workers/wrangler/environments/)
- [Cloudflare Workers: Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
