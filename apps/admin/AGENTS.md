# Discoflare Admin

Account-local control plane for Discoflare installations in one Cloudflare account.

Stack: Nuxt 4, Nuxt UI, Cloudflare Workers, and `@discoflare/installer-core`.

Repository invariants:

- One `discoflare-admin` Worker manages Discoflare installations in exactly one Cloudflare account.
- The Account Admin Token is stored only as this Worker's encrypted secret.
- The Admin never stores workspace messages, files, member data, Agent state, or arbitrary Cloudflare responses.
- Public `discoflare.com` may bootstrap or repair this Worker with temporary OAuth, but never receives its persistent token.
- Keep the Worker small: fixed deployment and RealtimeKit operations only; no generic Cloudflare API proxy, MCP server, Agents, or user code execution.
- `workers.dev` plus Cloudflare Access is the canonical production origin. A custom domain is not required.
