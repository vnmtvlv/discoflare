# Discoflare

Self-hosted team chat on a user's Cloudflare account.

Stack: Nuxt 4, Pinia, TanStack Query, D1 + Drizzle, Durable Objects (Channel / Workspace / RateLimit), R2, KV, RealtimeKit huddles.

Use the living documents instead of a separate product spec:

- `README.md` describes the shipped product and developer entry points.
- `CONTEXT.md` is the canonical product language.
- `docs/architecture.md` records runtime invariants.
- `docs/deployment.md` and `docs/remote-development.md` cover operations.

Repository invariants:

- One installation and URL contain one workspace. The web app does not select among multiple workspaces.
- One workspace installation remains one Nuxt/Nitro Worker at the repository root. The account-local control plane is a separate Worker built from `apps/admin`.
- Direct Messages, threads, reactions, attachments, roles, and optional RealtimeKit huddles are part of the current product.
- The marketing site and hosted installer live in `apps/com`. `sandbox.discoflare.com` is a deployment of the root workspace app, not a fork.
- Personal development targets belong in ignored env files or local deployment configs. Use the generic `dev:remote` command; never add personal hostnames, accounts, or per-installation commands to tracked code, tests, or documentation.
- Land focused feature and fix branches through squash-merged PRs directly to protected `main`. Keep `main` releasable; published releases are immutable version tags and GitHub Releases, so `main` may be ahead of the latest release.
- Keep changes within the shipped product and documented runtime boundaries unless explicitly requested.
