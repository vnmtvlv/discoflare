# Discoflare trust and security

Effective September 10, 2026.

## The short version

Discoflare is MIT-licensed software that runs in the workspace owner's Cloudflare account. There is no Discoflare server between an owner and their workspace, no vendor database holding workspace messages, and no subprocessor list for workspace data, because no Discoflare service processes it.

Four explicit boundaries touch anything belonging to a deployer: the temporary bootstrap on discoflare.com, Discoflare Admin in the owner's account, an anonymous deployment heartbeat, and the source that is deployed.

## What the installer asks for

During bootstrap, discoflare.com keeps the OAuth access token in an encrypted, HTTP-only session cookie. The token expires after one hour, is never written to a Discoflare database, and after bootstrap the cookie keeps only your installation list and handoff until it is cleared on sign-out.

Managed Setup requests the scopes needed to identify the owner, create or repair Admin, and operate managed installations. It stores the returned renewable credential only as encrypted Admin Worker secrets, then removes the website session. Later Admin sign-ins request identity, membership, and Worker-verification read scopes.

| Purpose | Scopes |
| --- | --- |
| Create or repair Discoflare Admin | `workers-scripts.read`, `workers-scripts.write` |
| Identify the owner and selected account | `account-settings.read`, `user-details.read`, `memberships.read` |
| Operate managed installations | `d1.read`, `d1.write`, `containers.read`, `containers.write`, `workers-kv-storage.read`, `workers-kv-storage.write`, `workers-r2.read`, `workers-r2.write`, `realtime.read`, `realtime.write`, `realtime.admin`, `zone.read`, `zone-settings.read`, `zone-settings.write`, `dns.read`, `dns.write`, `workers-routes.read`, `workers-routes.write`, `email-routing-rule.read`, `email-routing-rule.write`, `email-sending.read`, `email-sending.write` |

The bootstrap does not create Cloudflare Access, an API token, a workspace, or workspace storage. An operator can submit an Account Admin Token directly to Admin on its own origin; discoflare.com never receives it. Neither credential enters a workspace Worker. Admin login uses a stateless encrypted cookie and needs no Admin database.

## What leaves a deployment

A guided installation records one row after deployment and sends an authenticated weekly heartbeat afterwards.

| Stored | What it is |
| --- | --- |
| `installation_id` | A random identifier generated for the deployment. |
| `account_worker_hash` | A keyed HMAC-SHA-256 of the Cloudflare account ID and Worker name, used to recognise an update of the same deployment. It is not reversible without a secret held only by discoflare.com. |
| `token_hash` | A SHA-256 hash of the heartbeat token, so a deployment can authenticate later heartbeats. |
| `version` | The Discoflare release that was deployed. |
| `deployments` | How many times the deployment has been installed or updated. |
| `has_d1`, `has_r2`, `has_kv`, `has_custom_domain`, `has_email`, `has_agents`, `has_huddles` | Booleans recording which Cloudflare resource types and optional features are configured. Never amounts, sizes, or usage. |
| `first_seen_at`, `last_deployed_at`, `last_heartbeat_at` | Timestamps. |

The workspace owner can disable the heartbeat in Settings, Telemetry. Public counters on discoflare.com are aggregates of these rows and do not identify a deployment.

## What never leaves

The Cloudflare account ID, Worker name, workspace hostname, domain, and owner name and email are not stored. Neither are messages, mail, files, database records, tasks, member lists, Agent transcripts, or any measure of how much a workspace holds.

Owner name, email, and password are sent to Cloudflare as encrypted Worker secrets during a first installation and are not intentionally retained afterwards.

## Agent boundaries

Agents are workspace members, not sign-in identities. An Agent never receives a browser session or a human login, so a member's OAuth or social sign-in grants it no repository, shell, credential, or deployment access. An Agent cannot enter a private Channel it has not joined, Mail actions require an explicit mailbox grant, and risky conversational commands pause until an authorized member approves them.

Each Agent runs tools in one isolated Cloudflare Containers sandbox, checkpointed to the deployment's own R2 rather than kept alive as a permanent machine.

## Compliance posture

| Area | Status | Detail |
| --- | --- | --- |
| SOC 2 | Not applicable to a deployed workspace | Discoflare operates no service holding workspace data, so there is no processing environment to audit on an owner's behalf. Discoflare.com runs on Cloudflare, which is independently SOC 2 Type II and ISO 27001 certified. The project itself has not been audited. |
| GDPR | The deployer is the controller | A deployed workspace runs in the owner's account under their control, so Discoflare is not a processor of its data and no data processing addendum is required for it. |
| Data residency | Wherever the owner's Cloudflare account runs | Discoflare chooses no region. |
| HIPAA | No BAA offered | The project signs no Business Associate Agreements. Whether a self-operated workspace may carry protected health information is an assessment between the operator and Cloudflare. |
| PCI DSS | Out of scope | Discoflare has no billing, no checkout, and no cardholder data. |

## Subprocessors

A deployed workspace has none by default. It runs on the Cloudflare account its owner controls, and enabling voice Live sessions adds RealtimeKit, configured with the owner's own credentials.

Discoflare.com uses Cloudflare for hosting and for the D1 database holding the deployment rows described above, and GitHub for source, releases, and the installer manifest. The site uses no advertising or analytics providers.

## Reporting a vulnerability

Report security issues privately through a GitHub security advisory at https://github.com/vnmtvlv/discoflare/security/advisories/new. Include the affected version and enough detail to reproduce the issue. Do not open a public issue for a security report.
