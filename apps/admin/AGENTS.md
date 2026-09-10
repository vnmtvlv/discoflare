# Discoflare Admin

Account-local control plane for Discoflare installations in one Cloudflare account.

Stack: Nuxt 4, Nuxt UI, Cloudflare Workers, and `@discoflare/installer-core`.

Repository invariants:

- One `discoflare-admin` Worker manages Discoflare installations in exactly one Cloudflare account.
- The broad Cloudflare credential is either a renewable Managed OAuth credential or an account-owned token, stored only as this Worker's encrypted secrets.
- The Admin never stores workspace messages, files, member data, Agent state, or arbitrary Cloudflare responses.
- Managed setup stores its renewable OAuth credential; private setup uses temporary OAuth and never receives the operator-supplied Account Admin Token.
- Keep the Worker small: fixed deployment and RealtimeKit operations only; no generic Cloudflare API proxy, MCP server, Agents, or user code execution.
- Runtime RealtimeKit calls always terminate here through a service binding; they never proxy through `discoflare.com`.
- `workers.dev` is the canonical production origin. Cloudflare OAuth authenticates the configured owner and Admin keeps only an encrypted stateless cookie; Access and D1 are not required.
