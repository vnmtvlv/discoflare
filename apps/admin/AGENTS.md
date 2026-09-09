# Discoflare Admin

Account-local control plane for Discoflare installations in one Cloudflare account.

Stack: Nuxt 4, Nuxt UI, Cloudflare Workers, and `@discoflare/installer-core`.

Repository invariants:

- One `discoflare-admin` Worker manages Discoflare installations in exactly one Cloudflare account.
- The broad Cloudflare credential is stored only as this Worker's encrypted secrets: a Managed OAuth Grant or a private Account Admin Token.
- The Admin never stores workspace messages, files, member data, Agent state, or arbitrary Cloudflare responses.
- Managed setup transfers a renewable public-client OAuth grant into this Worker and discards the hosted copy; private setup uses temporary OAuth and never receives the operator's Account Admin Token.
- Keep the Worker small: fixed deployment and RealtimeKit operations only; no generic Cloudflare API proxy, MCP server, Agents, or user code execution.
- Runtime RealtimeKit calls always terminate here through a service binding; they never proxy through `discoflare.com`.
- `workers.dev` plus Cloudflare Access is the canonical production origin. A custom domain is not required.
