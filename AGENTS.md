# Discoflare

Self-hosted team chat on a user's Cloudflare account.

Stack: Nuxt 4, Pinia, TanStack Query, D1 + Drizzle, Durable Objects (Channel / Workspace / RateLimit), R2, KV, RealtimeKit Live rooms.

Use the living documents instead of a separate product spec:

- `README.md` describes the shipped product and developer entry points.
- `CONTEXT.md` is the canonical product language.
- `docs/architecture.md` records runtime invariants.
- `docs/deployment.md` and `docs/remote-development.md` cover operations.

Repository invariants:

- One installation and URL contain one workspace. The web app does not select among multiple workspaces.
- One workspace installation remains one Nuxt/Nitro Worker at the repository root. Guided installations also use one account-local Discoflare Admin per Cloudflare account, built from `apps/admin` and `packages/admin-core`; the separate `discoflare-com` repository creates Admins and relays OAuth reconnects but keeps no Cloudflare credential.
- Direct Messages, threads, reactions, attachments, roles, and optional RealtimeKit Live rooms and Calls are part of the current product.
- The marketing site and hosted installer live in the separate `discoflare-com` repository. `sandbox.discoflare.com` is a deployment of this root workspace app, not a fork.
- Personal development targets belong in ignored env files or local deployment configs. Use the generic `dev:remote` command; never add personal hostnames, accounts, or per-installation commands to tracked code, tests, or documentation.
- Land focused feature and fix branches through squash-merged PRs directly to protected `main`. Keep `main` releasable; published releases are immutable version tags and GitHub Releases, so `main` may be ahead of the latest release.
- For feature and fix work, follow the agent workflow in `docs/worker-previews.md`: open a same-repository PR, wait for its isolated Worker Preview, and verify the change there before asking to merge.
- Treat D1 migrations as a serialized integration log. Before finalizing a migration PR, update it from current `origin/main`, create the next migration with `pnpm db:migration:create <lowercase_name>`, and rerun its Preview. Never edit migration SQL that already exists on `main`; follow the migration procedure in `docs/worker-previews.md`.
- Keep changes within the shipped product and documented runtime boundaries unless explicitly requested.
