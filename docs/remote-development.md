# Remote development

Use one command, `pnpm dev:remote`, to run the local Nuxt frontend against any
Discoflare installation. Personal hostnames and deployment resource identifiers
belong in ignored local configuration, never in package scripts, tests, or
committed examples.

## Select the backend

Set the target in `.env`:

```dotenv
DISCOFLARE_DEV_PROXY_ORIGIN=https://chat.example.com
```

```bash
pnpm dev:remote
```

Or select an isolated local profile containing that variable:

```bash
pnpm dev:remote -- --env-file .env.personal
```

Or pass a URL directly:

```bash
pnpm dev:remote -- https://chat.example.com
```

An explicit URL overrides the environment. Shell environment variables override
the selected file. Without `--env-file`, the command reads `.env` if present.
With `--env-file`, both the launcher and Nuxt load that file instead of `.env`.
A missing explicit file fails before starting Nuxt. All `.env.*` profiles except
`.env.example` are ignored by Git.

## What runs where

Open `http://localhost:3000`. The current frontend source runs locally with Nuxt
hot reload. Requests to `/api` are proxied to the selected backend, with cookie
and Origin rewriting. WebSockets connect directly to the remote backend using
short-lived socket tickets.

The deployed backend runs its own API, Durable Objects, Workflows, agent
containers, and storage. Local server changes do not run in this mode. No
Cloudflare credentials or copy of the backend's `AUTH_SECRET` are needed for the
frontend connection. Sign in separately on localhost; browser sessions are
origin-scoped. Writes affect the selected installation.

## Backend development

Use a personal Cloudflare installation with its own Worker, D1, R2, KV, Durable
Objects, Workflows, and agent containers. Deploy the current feature branch to
that installation when testing backend changes, then exercise it through the
local frontend. Keep its deployment config and credentials outside Git.

The shared integration installation should follow `dev`; personal installations
can run feature branches before their PRs are merged. Use separate resources so
schema changes and experiments do not affect the shared installation.

`pnpm dev:remote` only starts the frontend; it never deploys or applies migrations.
For local backend execution, use `pnpm dev` or `pnpm dev:full` instead.

A temporary `wrangler dev --remote` preview is not a complete substitute for a
Discoflare installation: Cloudflare does not support Workflows or Containers in
that mode. See [Cloudflare's development binding support](https://developers.cloudflare.com/workers/local-development/bindings-per-env/).
