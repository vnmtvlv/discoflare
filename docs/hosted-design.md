# Hosted mode

Hosted mode is an optional way for an operator to run many Discoflare workspaces on one Cloudflare account. Each workspace is still one installation and one URL. The people using a workspace do not receive a Cloudflare account, a Discoflare Admin, or a Cloudflare credential.

Self-host stays the default. A self-hosted installation deploys into its own Cloudflare account from the same codebase. `DISCOFLARE_HOSTED=true` is the only runtime switch. When it is unset, usage checks return immediately and the hosted provisioner is not on the install path.

Every operator-specific value is configuration. This repository does not name an account, a dispatch namespace, an apex hostname, a usage limit, or a model rate.

## Shape

```text
operator control plane (not part of this repository)
  provisionHostedWorkspace
  addHostedAgentCredit
  setHostedWorkspaceRouting
        │  account API token, never stored in the user Worker
        ▼
one Cloudflare account
  D1 + R2 + KV per workspace
  user Worker in a dispatch namespace (name from the provision request)
        ▲
        │  DISPATCHER.get("ws-<slug>")
dispatch Worker  ←  <slug>.<apex>
  HOSTED_APEX
  optional ROUTES KV
```

One workspace remains one Nuxt Worker, one D1 database, and one set of Durable Object classes exported from `server/cloudflare-entry.ts`. Hosted mode does not add a `tenant_id` column. The schema, backup, and authorization code stay single-tenant because the tenant boundary is the Worker and its bindings.

The user Worker does not get `DISCOFLARE_ADMIN`. Domain, mail, Live, and deletion stay unavailable until an operator replaces those Admin calls. Chat, files, backups, and agents work without that binding, which is already how a manual deployment behaves.

## Configuration

| Value | Where it is set |
| --- | --- |
| Cloudflare account id | `provisionHostedWorkspace` request |
| Dispatch namespace | `provisionHostedWorkspace` request. There is no default name. |
| Apex hostname | `provisionHostedWorkspace` request, and `HOSTED_APEX` on the dispatch Worker |
| Included usage per month | `includedUsageUnits` on the provision request, copied to `DISCOFLARE_AGENT_USAGE_UNITS` |
| Model rates | Optional `modelRates` map, copied to `DISCOFLARE_AGENT_MODEL_RATES` |
| Unknown-turn units | Optional `unknownTurnUnits`, copied to `DISCOFLARE_AGENT_UNKNOWN_TURN_UNITS` |
| Routing KV namespace | Optional `routingKvId`. The dispatch Worker binds the same namespace as `ROUTES`. |
| Script name | `ws-<slug>`, derived from the slug |

The apex is any hostname the operator routes to the dispatch Worker. Public traffic uses `https://<slug>.<apex>`.

## What this repository provides

| Piece | Where | What it does |
| --- | --- | --- |
| Naming and the usage ledger | `packages/admin-core/src/hosted-plan.ts` | Slug, apex, script name, and integer usage units |
| Provisioner | `provisionHostedWorkspace` in `packages/admin-core/src/hosted.ts` | Creates per-workspace D1, R2, and KV; applies the release migrations; uploads the user Worker into the given dispatch namespace; writes the usage ledger |
| Extra units and pause | `addHostedAgentCredit`, `setHostedWorkspaceRouting` | Add units that survive the monthly reset, or mark a slug active or suspended |
| Usage gate | `workers/hosted-usage.ts`, called from `DiscoflareThink` | Refuses a turn when the ledger is spent, then records units |
| Dispatcher | `workers/hosted-dispatch.ts` | Routes `<slug>.<apex>` to script `ws-<slug>`, and returns 402 when routing KV says `suspended` |
| Release marker | `hosted-workspace-v1` in `scripts/build-installer-release.mjs` | The provisioner refuses a release that does not contain the gate |

`provisionHostedWorkspace` is idempotent. A repeat call for the same script returns the existing workspace and does not rotate `AUTH_SECRET` or the owner setup token.

An operator calls these functions from their own control plane. That control plane holds the account API token. This repository does not include billing, customer accounts, or that control plane.

## Operator setup

Before the first workspace, the operator account needs:

1. Workers for Platforms, with a dispatch namespace created as `trusted_workers: true`. The namespace runs only the operator's Discoflare bundle. The workspace entrypoint reads `request.cf`, which untrusted mode hides.
2. R2 and Workers AI enabled. The default model is the same `AGENT_MODEL` a self-hosted install uses.
3. A zone whose wildcard route points at the dispatch Worker, and `HOSTED_APEX` set to that zone's apex.
4. A KV namespace bound as `ROUTES` on the dispatch Worker when pause and script name should be stored at create time.
5. A scoped API token held only by the operator's control plane.

User Workers have no `workers.dev` hostname. All public traffic enters through the dispatch Worker.

## Bindings

A guided self-host install (`packages/admin-core/src/deploy.ts` and `wrangler.jsonc`) attaches the bindings below. Queues, Vectorize, Hyperdrive, Analytics Engine, and AI Gateway are not bindings in this codebase. The Think queue is a Durable Object ledger, not Cloudflare Queues. Notification delivery is a D1 outbox plus `NotificationDurableObject` alarms.

| Binding | Self-host | Hosted mode | Later |
| --- | --- | --- | --- |
| `DB` (D1) | One database per installation. 10 GB is the hard per-database cap. | One new database per workspace. Same migrations. | Keep one database per workspace. A shared database would need a tenant column the schema does not have. |
| `FILES` (R2) | One bucket, optional. Backup lists the whole bucket. | Always on. One bucket per workspace, so backup and deletion cannot see another workspace. An account allows 1,000,000 buckets. | A shared bucket with prefixes only after backup, delete, and health checks take a prefix. |
| `TICKETS` (KV) | Short-lived tickets and the deletion claim. | One namespace per workspace. Also stores `hosted:agent-usage`. | A shared namespace is possible later. Tickets are not in the backup. |
| Durable Object classes | SQLite classes exported by the Worker. Sockets use the hibernation API. | Same classes uploaded with the user Worker, so each script gets its own namespaces. `getByName` cannot see another script. | Do not bind one shared namespace into every user Worker. |
| `AI` | Workers AI. Model id in `AGENT_MODEL` or the agent profile. | Bound. Calls are limited by the KV ledger, not by a separate gateway per workspace. | One account-level AI Gateway can be an extra backstop. Paid accounts are limited to 20 gateways, so one gateway with metadata, not one per workspace. |
| `BROWSER` | Browser Run Quick Actions. | Not bound. Browser time is account-level and is not in the usage ledger. | Bind it when browser time is metered per workspace. |
| `ASSETS` | Static Nuxt assets. | Same upload, using the dispatch-namespace assets session. The session JWT is the bearer token for that upload. | — |
| `EMAIL` / `MAIL_EMAIL` | Email Sending, plus exact Email Routing rules to this Worker. | Not bound. | One platform mail Worker can receive the zone's rules and forward MIME into the user Worker. |
| `DISCOFLARE_ADMIN` | Service binding to the account-local Admin. | Absent. The user Worker holds no Cloudflare credential. | A narrow service binding to the operator's control plane if the workspace must request a domain or a backup. |
| RealtimeKit | API token or the Admin. Not a Worker binding. | Not provisioned. Live stays off. | One RealtimeKit app per workspace, with its own limit. |
| Weekly telemetry cron | Optional heartbeat. | No cron and no telemetry secret on the user Worker. | — |
| `AUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_SETUP_TOKEN` | Per installation. | Generated once at create. Not returned again on retry. | — |

Durable Object isolation depends on the classes living in the user Worker script, including SQLite migrations `v1` through `v4`. If a dispatch upload rejects those migrations, stop. Do not fall back to one shared namespace.

The phase-1 upload does not set `placement: smart`. Request handling does several D1 round trips, and the Worker should run near the D1 primary. Confirm the dispatch script API field on a real upload before inviting people.

## Provisioning

The owner claims the workspace at `/setup#claim=<token>`, the same path a self-hosted builtin install uses. Authentication mode is builtin and registration is invite-only. Access mode stays a self-host feature: one Zero Trust team per workspace does not fit on a shared account.

Suggested control-plane record, not a schema in this repository:

- `slug` and `status` (`provisioning`, `active`, `suspended`, `deleted`)
- script name `ws-<slug>`, D1 id, R2 bucket, KV id
- included units, and a copy of extra units for the operator's own display (the KV ledger remains authoritative)
- version deployed, owner email, and whether the setup URL has been used

| Operator action | Call |
| --- | --- |
| New slug | `provisionHostedWorkspace`. Store the returned URL and setup URL. The workspace does not email that link itself. |
| Same request again | The provisioner returns `created: false`. Do not mint a second setup token. |
| Pause | `setHostedWorkspaceRouting(..., 'suspended')`. The dispatch Worker answers 402. Data stays. |
| Resume | `setHostedWorkspaceRouting(..., 'active')`. |
| Add units | `addHostedAgentCredit`. Extra units survive the monthly reset. Unused monthly inclusion does not. |

## Hostnames

First-party hostnames do not need Cloudflare for SaaS. `*.<apex>` is a wildcard route on a zone the operator controls. The dispatch Worker reads `HOSTED_APEX`, takes the first label, and loads `ws-<slug>`.

```text
<slug>.<apex>
  → routeHostedRequest
  → ROUTES status:<slug>  (suspended → 402)
  → ROUTES script:<slug>, or ws-<slug>
  → user Worker
```

If `HOSTED_APEX` is unset, the dispatch Worker returns 503. Reserved labels (`www`, `api`, `admin`, `mail`, `hosted`, `status`, `app`, `cdn`, `static`) cannot be provisioned. The apex itself is not a workspace. A slug is 1–40 lowercase letters, numbers, or hyphens.

Customer-owned hostnames are a later option. They can use Cloudflare for SaaS custom hostnames on the same zone. The dispatch Worker would look the hostname up in `ROUTES` instead of trusting the label. A hostname the customer can CNAME is the simpler first offer.

## Usage limits

Usage is an integer unit chosen by the operator. This module does not convert units to currency.

The ledger lives in the workspace KV key `hosted:agent-usage`:

```json
{ "period": "2026-10", "includedUnits": 1000, "includedUsedUnits": 0, "creditUnits": 0 }
```

`includedUnits` comes from the provision request. A new UTC calendar month zeroes `includedUsedUnits` and leaves `creditUnits` alone, including a negative balance from a turn that overshot.

`DiscoflareThink.beforeTurn` refuses the turn when available units are not positive. `onChatResponse` records units from `usage.inputTokens` / `outputTokens` (or the OpenAI-style prompt and completion names) using `DISCOFLARE_AGENT_MODEL_RATES`. Each rate is `inputUnitsPerMillion` and `outputUnitsPerMillion`.

A model with no configured rate has no unit count. That turn exhausts the remaining inclusion and any positive extra units, so the next turn stops. A completed turn with no token counts does the same, unless the operator set `DISCOFLARE_AGENT_UNKNOWN_TURN_UNITS` to a non-negative integer.

Two turns can pass the check together, and one turn can finish over the balance. The next turn then stops. A single turn cannot run unbounded steps (`maxSteps` is 20). An account-level AI Gateway spend limit can be a harder backstop. AI Gateway allows 20 spend rules per gateway, which is not one rule per workspace, so the per-workspace number stays in this ledger.

Customer-supplied model keys are not part of this shape. If an operator adds them later, store the key outside the user Worker and still cap turns. A key can drive Durable Object and subrequest work on the operator's account even when the model request does not use the operator's Workers AI binding.

## Backups, export, and deletion

The owner backup in Workspace Settings already exports one installation: ordered D1 SQL fragments and every R2 object, as a TAR, to the browser or to an S3 destination encrypted with `AUTH_SECRET`. It does not include Worker secrets, KV, live Durable Object state, or an in-flight agent turn.

Hosted mode requires R2 so that export can include files. It does not add a scheduled platform backup. D1 Time Travel on a paid account is an operator restore tool, not the workspace export. An operator who wants an independent copy can run the same export into a bucket the workspace cannot read.

Deletion, when the operator automates it:

1. Suspend routing so the hostname stops serving.
2. Offer the export, or confirm one exists, and keep it for the operator's retention window.
3. Delete the dispatch script. That deletes the script's Durable Object storage.
4. Delete that workspace's D1 database, R2 bucket, and KV namespace.
5. Delete `status:<slug>` and `script:<slug>`.
6. Delete the control-plane row, aside from whatever the operator must retain.
7. Do not delete the workspace's own S3 backup destination. The self-host uninstaller already leaves that alone.

A self-hosted delete still goes through the account-local Admin. Hosted deletion must not call that path.

Facts an operator should be able to describe:

- The isolation boundary is separate D1 databases, R2 buckets, KV namespaces, and Durable Object namespaces inside one Cloudflare account. It is not the dedicated-account boundary that self-hosting gives.
- `AUTH_SECRET` is per workspace. Provider secrets and the S3 backup secret are AES-GCM under that key, as they are today.
- Workers Logs and AI Gateway logs are account-scoped. Do not log message bodies. Give a workspace its export, not a slice of the account log stream, until logs can be filtered per script.
- D1 jurisdiction is unset. Choose it when the database is created if a workspace needs a region.

## Updates

User Workers do not support gradual deployments. Each upload goes to 100 percent of that script.

A hosted release is the same release artifact as self-host, which is why the capability flag lives on that manifest. The rollout is:

1. Deploy the dispatch Worker only when its contract changes. It is one script.
2. Run the new D1 migrations on one canary database.
3. Upload the new user Worker to the canary with `keep_bindings` for secrets, the same way `deployDiscoflareUpdate` preserves a self-hosted install.
4. Upload the rest in small batches. A failed health check (`/api/setup/health` version and `migrated`) pins that workspace to the previous script and stops the batch.

Self-host updates stay on the Admin and are not driven by this loop. Do not edit a migration that is already on `main`. Hosted mode and self-host share `drizzle/migrations`.

## One codebase

| Concern | Self-host | Hosted mode |
| --- | --- | --- |
| Who deploys | Account-local Admin, or a manual Wrangler deploy | `provisionHostedWorkspace` from the operator's control plane |
| Cloudflare credential | Admin's D1, encrypted | Control plane only |
| Public hostname | `workers.dev` or a customer zone | `<slug>.<apex>` from configuration |
| Agent usage | The workspace account's Workers AI usage | Ledger in `TICKETS`, in operator-defined units |
| Files | Optional R2 | Required R2 |
| Browser, mail, Live, Access | As the installation configures them | Off until a later change |

There is no second Worker bundle. The release manifest gains `hosted-workspace-v1` and remains valid for self-host. Nothing requires the flag to be absent.

## Risks

- **Trusted namespace.** The operator controls the code, which is why trusted mode fits. Workspaces must not upload their own script into the dispatch namespace.
- **Outbound `fetch` from Durable Objects is not intercepted** by an Outbound Worker. Do not rely on an Outbound Worker to meter model calls. The gate is inside `DiscoflareThink`, which is the only agent path.
- **Concurrent turns and missing rates.** Two turns can pass the check together. An unconfigured model exhausts the ledger. Compare the KV ledger with Workers AI logs on a canary.
- **Account-wide blast radius.** A Workers AI rate limit, the account D1 storage cap, or a bad release hits every hosted workspace. Self-hosted installations are unaffected.
- **Logs.** Account-wide logs can contain URLs and errors. Review `console` output before storing customer content.
- **R2 must already be enabled** on the account. Creating the first bucket fails otherwise.
- **10 GB D1 cap** cannot be raised. One busy workspace can fill its database. Alert before sharding.
- **KV lookup is one page.** Reusing a ticket namespace scans the first page of account namespaces. Paginate that list before the account has more namespaces than one response returns.
- **Deletion is a separate job.** Pausing a hostname does not delete data.
- **Smart placement is not set** on the phase-1 upload. Chat latency suffers if the Worker runs far from its D1 primary.

## Later

Custom hostnames. Email through one platform mail Worker. Live with its own limit. Browser Run with its own limit. Customer model keys. A service binding from the user Worker to the operator's control plane for actions that today go to the Admin. Moving an existing self-hosted workspace into hosted mode.

Self-host does not depend on any of that. A release that includes `hosted-workspace-v1` is still a normal self-hosted release.
