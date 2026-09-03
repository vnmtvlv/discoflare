# Sandbox development

`sandbox.discoflare.com` is a deployment of this repository, not a separate app. Local development can use its Cloudflare resources, but Discoflare needs a fully remote Wrangler preview to preserve the deployed Durable Object and WebSocket topology.

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

3. Fill the account ID, deployed sandbox Worker name, D1 name and ID, R2 bucket name, KV namespace ID, and the sandbox `AUTH_SECRET`. No real IDs or secrets are committed.

4. Start the sandbox-backed preview:

   ```bash
   pnpm dev:sandbox
   ```

The command validates the environment, verifies Wrangler authentication, builds Nuxt with `.env.sandbox`, creates an ignored Wrangler config under `.wrangler/discoflare-sandbox/`, and starts `wrangler dev --remote` at `http://localhost:3000`.

The command never applies D1 migrations, seeds data, or deploys a permanent Worker version. Rerun it after changing Nuxt source; Wrangler watches the generated Worker output, not the original Nuxt source tree.

## What is remote

- API and Worker code execute in a temporary Cloudflare preview, reached through localhost.
- D1, R2, and KV point at the deployed sandbox resources.
- `CHANNEL_DO`, `WORKSPACE_DO`, and `RATE_LIMIT_DO` point at the namespaces exported by the deployed sandbox Worker. Those objects therefore run the deployed sandbox Durable Object code.
- Static assets come from the current local build.

All D1, R2, KV, Durable Object, and RealtimeKit writes affect the real pilot sandbox and may incur normal Cloudflare usage charges. Treat `pnpm dev:sandbox` as production-data access scoped to the disposable sandbox, not as an isolated test environment.

## Why not ordinary local remote bindings?

Cloudflare supports per-binding remote connections for D1, R2, and KV while Worker code runs locally. It does not support a direct remote Durable Object binding in that mode. Without the remote preview, Discoflare would run local Durable Objects against remote storage: localhost users would have separate presence, sockets, broadcasts, and rate-limit state from users on `sandbox.discoflare.com`.

Wrangler's remote development mode supports D1, R2, KV, and Durable Objects, so it is the consistent option for this app. It is slower than `pnpm dev`, uploads code to a temporary preview environment, adds network latency, and mutates the selected remote resources.

## Authentication and OAuth

Use the same `AUTH_SECRET` as the deployed sandbox. Existing sandbox login rows live in the shared D1 database, while browser cookies remain origin-scoped, so logging in at localhost does not copy the browser session from `sandbox.discoflare.com`.

X sign-in is optional locally. If enabled in `.env.sandbox`, register this additional callback in the X application:

```text
http://localhost:3000/api/auth/callback/twitter
```

## Sources

- [Cloudflare Workers: local development and remote bindings](https://developers.cloudflare.com/workers/local-development/)
- [Cloudflare Workers: supported bindings per development mode](https://developers.cloudflare.com/workers/local-development/bindings-per-env/)
- [Cloudflare Workers: Wrangler environments and dotenv files](https://developers.cloudflare.com/workers/wrangler/environments/)
- [Cloudflare Workers: Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
