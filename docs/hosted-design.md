# Discoflare Hosted

Status: design plus the phase-1 library in this repository. Not live.

Discoflare Hosted runs customer workspaces on a Discoflare-owned Cloudflare account. Each workspace is still one installation and one URL. Customers do not get a Cloudflare account, a Discoflare Admin, or a copy of the Cloudflare credential. The self-hosted product stays MIT and keeps deploying into the customer's own account from the same codebase.

This document is the implementation plan for the first version that can take money. Later sections record how the rest of the product maps onto that account, because those choices constrain the first version.

## What the first version is

A person pays on discoflare.com. A Polar webhook in the private `discoflare-com` control plane calls into this repository's `@discoflare/admin-core` and gets back a workspace at `https://<slug>.hosted.discoflare.com`, with:

- its own D1 database, R2 bucket, KV namespace, and Durable Object namespaces
- builtin accounts, invite-only, and a one-time owner setup link
- a monthly agent allowance (starting point: $5 of Workers AI) plus prepaid credit from usage packs
- the existing owner backup (D1 SQL plus every object in that workspace's R2 bucket)

It does not include, in the first paid version:

- customer-owned domains, email, Live, or Browser Run
- Cloudflare Access as the login perimeter
- a Discoflare Admin inside the hosted account
- moving an existing self-hosted workspace into Hosted

`$49/mo` is the workspace subscription. Usage packs add agent credit. Support packs are a Polar product and a human process; they do not change Cloudflare bindings.

## What is already implemented

This repository now contains the phase-1 engine. It is unit-tested and does not call Cloudflare.

| Piece | Where | What it does |
| --- | --- | --- |
| Naming, ledger, and model rates | `packages/admin-core/src/hosted-plan.ts` | Slug, apex, monthly inclusion, usage-pack credit, token price in USD micros |
| Provisioner | `provisionHostedWorkspace` in `packages/admin-core/src/hosted.ts` | Creates per-tenant D1, R2, and KV; applies the release migrations; uploads the user Worker into a dispatch namespace; writes the allowance ledger |
| Credit and pause | `addHostedAgentCredit`, `setHostedWorkspaceRouting` | The calls a Polar webhook makes after the workspace exists |
| Allowance gate | `workers/hosted-usage.ts`, called from `DiscoflareThink` | Self-hosted workers skip it. Hosted workers refuse a turn when the ledger is spent, then record token cost |
| Dispatcher | `workers/hosted-dispatch.ts` | Routes `slug.<apex>` to script `ws-<slug>`, and returns 402 when routing KV says `suspended` |
| Release marker | `hosted-workspace-v1` in `scripts/build-installer-release.mjs` | The provisioner refuses a release that does not contain the gate |

`provisionHostedWorkspace` is idempotent. A Polar retry for the same slug returns the existing script and does not rotate `AUTH_SECRET` or the owner setup token.

## What blocks a live workspace

Two things are outside this repository, and both are required before the webhook can succeed.

**Workers for Platforms is not enabled.** On 13 October 2026 the Cloudflare credentials available to this session could list accounts, including `discoflare-dev` and `vnmtvlv`. `GET /accounts/{id}/workers/dispatch/namespaces` on both returned error `10121`: the account does not have Workers for Platforms. There is no dispatch namespace to upload into. Buying it is a dashboard purchase on the account that will own customer data ([Workers for Platforms pricing](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/platform/pricing/), $25 per month). Do that on a dedicated Discoflare account, not on a personal account that also holds unrelated zones.

**`vnmtvlv/discoflare-com` is not visible from this environment.** The Polar webhook, customer record, and checkout have to land in that repository. This pull request exports the functions that webhook should call. It does not subscribe to Polar.

Also required once, on the hosted account, and not created by this pull request:

1. Workers Paid, R2 enabled, and Workers AI enabled. The default model `@cf/moonshotai/kimi-k2.7-code` requires a paid billing method.
2. A dispatch namespace named `discoflare-hosted`. Create it with `trusted_workers: true`. The namespace runs only Discoflare's bundle, and the workspace entrypoint reads `request.cf`. Untrusted mode hides that object.
3. Zone `hosted.discoflare.com` (name is a product choice) with a wildcard DNS record to a placeholder origin, a wildcard route to the dispatch Worker, and `HOSTED_APEX` set on that Worker.
4. A KV namespace bound as `ROUTES` on the dispatch Worker. Pass its id as `routingKvId` when provisioning so pause and script name are written at create time.
5. A scoped Cloudflare API token held only by the control plane's Hosted Control path. No user Worker receives it.

Until those exist, `provisionHostedWorkspace` is a library call. Pointing it at today's accounts fails at the dispatch-namespace API.

## Runtime shape

```text
Polar
  subscription active / order paid
        │
        ▼
discoflare.com  (accounts, Polar, ledger mirror, operator UI)
  calls provisionHostedWorkspace / addHostedAgentCredit / setHostedWorkspaceRouting
        │  account API token, never stored in the user Worker
        ▼
Hosted Control on the Discoflare Cloudflare account
  D1 + R2 + KV per workspace
  user Worker in dispatch namespace discoflare-hosted
        ▲
        │  DISPATCHER.get("ws-<slug>")
dispatch Worker  ←  acme.hosted.discoflare.com
```

One workspace remains one Nuxt Worker, one D1, and one set of Durable Object classes exported from `server/cloudflare-entry.ts`. Hosted does not introduce a `tenant_id` column. The schema, backup, and authorization code stay single-tenant because the tenant boundary is the Worker and its bindings.

The user Worker does not get `DISCOFLARE_ADMIN`. Domain, mail, Live, and deletion stay unavailable in the product UI until a later phase replaces those Admin calls with Hosted Control. Chat, files, backups, and agents work without that binding, which is already how a manual deployment behaves.

`DISCOFLARE_HOSTED=true` is the only runtime switch. Self-hosted workers leave it unset. The allowance functions return immediately, and `provisionHostedWorkspace` is not on the self-host path.

## Bindings

Today's guided install (`packages/admin-core/src/deploy.ts` and `wrangler.jsonc`) attaches the bindings below. Queues, Vectorize, Hyperdrive, Analytics Engine, and AI Gateway are not bindings in this codebase. "Think durably queues" is a Durable Object ledger, not Cloudflare Queues. Notification delivery is a D1 outbox plus `NotificationDurableObject` alarms.

| Binding | Self-host | Hosted MVP | Later |
| --- | --- | --- | --- |
| `DB` (D1) | One database per installation. History, auth, Data, mail index, push outbox. 10 GB is the hard per-database cap. | One new database per workspace. Same migrations. | Keep per-tenant. A shared database would require a tenant column the schema does not have. |
| `FILES` (R2) | One bucket, optional. Backup lists the whole bucket. | Always on. One bucket per workspace, so backup and deletion cannot see another tenant. Account limit is 1,000,000 buckets. | A shared bucket with prefixes only after backup, delete, and health checks take a prefix. |
| `TICKETS` (KV) | Short-lived tickets and the deletion claim. | One namespace per workspace. Also stores `hosted:agent-usage`. | A shared namespace is acceptable later; tickets are not in the backup. |
| `CHANNEL_DO`, `WORKSPACE_DO`, `RATE_LIMIT_DO`, `NOTIFICATION_DO`, `AGENT_DO`, `AGENT_THINK` | SQLite classes exported by the Worker. Names are `channel:<id>`, `workspace:<id>`, and so on. Sockets use the hibernation API. | Same classes uploaded with the user Worker, so each script gets its own namespaces. `getByName` cannot see another script. | Do not bind one shared namespace into every user Worker. A bug that trusts a caller-supplied id would cross tenants. |
| `AI` | Workers AI. Model id in `AGENT_MODEL` or the agent profile. No vendor key. | Bound. Calls are capped by the KV ledger, not by a separate gateway per tenant. | AI Gateway in front of the binding for an account-wide spend backstop and logs. Paid accounts are limited to 20 gateways, so one gateway with metadata, not one per workspace. |
| `BROWSER` | Browser Run Quick Actions. | **Not bound.** Browser hours are account-level (10 hours included, then $0.09/hour) and are not in the agent ledger. | Bind it when browser time is metered per workspace. |
| `ASSETS` | Static Nuxt assets. Requests to them are not billed as Worker requests. | Same upload, using the dispatch-namespace assets session. | — |
| `EMAIL` / `MAIL_EMAIL` | Email Sending, plus exact Email Routing rules to this Worker. | Not bound. | One platform mail Worker receives the zone's rules and forwards MIME into the user Worker. Per-tenant sender addresses. |
| `DISCOFLARE_ADMIN` | Service binding to the account-local Admin. | Absent. The user Worker holds no Cloudflare credential. | A narrow service binding to Hosted Control if the workspace must request a domain or a backup later. |
| RealtimeKit | API token or the Admin. Not a Worker binding. | Not provisioned. Live stays off. | One RealtimeKit app per workspace on the Discoflare account, with a minute allowance. |
| Cron `17 4 * * 1` | Anonymous heartbeat to discoflare.com. | No cron and no telemetry secret. The control plane already knows the customer. | — |
| `AUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_SETUP_TOKEN` | Per installation. | Generated once at create. Not returned again on retry. | — |

Durable Object isolation depends on the classes living in the user Worker script. Confirm that on the first real upload, including SQLite migrations `v1` through `v4`. If the dispatch upload rejects those migrations, stop and do not fall back to one shared namespace.

`placement: smart` matters. The architecture notes that request handling does several D1 round trips, and the Worker should run near the D1 primary. The phase-1 upload does not set placement, because that field should be confirmed against the dispatch script API rather than guessed. Set it on the first live script before inviting a customer.

## Paid signup

discoflare.com owns the customer, the Polar customer id, and the workspace row. Suggested row, not a schema in this repository:

- `slug`, `status` (`provisioning`, `active`, `suspended`, `deleted`)
- Cloudflare script name `ws-<slug>`, D1 id, R2 bucket, KV id
- Polar subscription id
- `includedMicros` (plan) and a copy of credit for support, the KV ledger remaining authoritative for the Worker
- version deployed, owner email, setup URL consumed or not

Webhook behavior:

| Polar state | Action |
| --- | --- |
| Subscription becomes active, and the slug is new | `provisionHostedWorkspace`. Store the returned URL and setup URL. Email or show the setup link. The workspace does not send that email itself. |
| Same event delivered again | The provisioner returns `created: false`. Respond 200. Do not mint a second setup token. |
| Subscription past due or canceled | `setHostedWorkspaceRouting(..., 'suspended')`. The dispatch Worker answers 402. Data stays. |
| Subscription active again | `setHostedWorkspaceRouting(..., 'active')`. |
| Usage-pack order paid | `addHostedAgentCredit` with the pack's micros. Credit survives the monthly reset. Unused monthly inclusion does not. |
| Support-pack order paid | Record the entitlement in discoflare.com. No Cloudflare change. |
| Subscription revoked, after the retention window | Deletion procedure below. Not part of the first webhook. A revoked subscription suspends; a person or a later job deletes. |

Store the Polar event id and ignore duplicates. Verify the webhook signature. The account API token stays in discoflare.com or in a Hosted Control Worker. It must not be copied into the user Worker, which is the same rule ADR 0005 sets for customer accounts.

The owner claims the workspace at `/setup#claim=<token>` exactly as a self-hosted builtin install does. Authentication mode is builtin and registration is invite-only. Access mode stays a self-host feature: one Zero Trust team per customer does not fit on the Discoflare account.

## Subdomains

First-party hostnames do not need Cloudflare for SaaS. `*.hosted.discoflare.com` is a wildcard route on a zone Discoflare owns. The dispatch Worker takes the first label and loads `ws-<slug>`.

```text
acme.hosted.discoflare.com
  → routeHostedRequest
  → ROUTES status:acme  (suspended → 402)
  → ROUTES script:acme, or ws-acme
  → user Worker
```

Reserved labels (`www`, `api`, `admin`, `mail`, and the others in `isHostedSlug`) cannot be purchased. The apex is not a workspace.

Customer-owned hostnames are a later phase. They use Cloudflare for SaaS custom hostnames on the same zone: 100 included, then $0.10 per hostname per month, up to 50,000 on a non-Enterprise zone. The customer CNAMEs their hostname at the SaaS fallback target. The dispatch Worker looks up the hostname in `ROUTES` instead of trusting the label. Apex proxying for a customer's root domain is an Enterprise add-on; the first custom-domain offer should be a hostname they can CNAME (`chat.customer.com`).

User Workers do not get a `workers.dev` hostname. All public traffic enters through the dispatch Worker.

## Agent allowance

The ledger lives in the workspace KV key `hosted:agent-usage`:

```json
{ "period": "2026-10", "includedMicros": 5000000, "includedUsedMicros": 0, "creditMicros": 0 }
```

Amounts are USD micros ($1 = 1,000,000). The default inclusion is $5 per UTC calendar month (`HOSTED_INCLUDED_ALLOWANCE_MICROS`). A new month zeroes `includedUsedMicros` and leaves `creditMicros` alone, including a negative balance from a turn that overshot.

`DiscoflareThink.beforeTurn` refuses the turn when available micros are not positive. `onChatResponse` records cost from `usage.inputTokens` / `outputTokens` (or the OpenAI-style prompt/completion names). The default model is priced at the published Workers AI rate for `@cf/moonshotai/kimi-k2.7-code` ($0.95 / million input, $4 / million output, as of 9 October 2026). A model missing from the table is priced at the highest listed chat rate ($1.40 / $4.40) so an unlisted model is not the cheap path. A completed turn with no token counts costs a flat $0.20 so a silent response cannot be free.

This is a soft cap. Two turns can pass the check together, and one turn can finish over the balance. The next turn then stops. That is acceptable for the first version because a single turn cannot run unbounded steps (`maxSteps` is 20) and the flat unknown charge is small. An account-wide AI Gateway spend limit is the hard backstop once the gateway exists. AI Gateway allows 20 spend rules per gateway, which is not one rule per workspace, so the per-workspace number stays in our ledger.

BYO keys are not in the first version. When they are, the customer key is stored encrypted in the control plane and attached as an AI Gateway BYOK provider. Those tokens should draw credit only if the product says so; they still need a turn cap so a key cannot drive unbounded Durable Object and subrequest cost on our account. The Workers AI neuron price is then the customer's provider bill, not ours.

The $5 starting inclusion is a cost choice, not a price on the website. At the default model's output rate, $5 is 1.25 million output tokens plus input. A workspace that talks to agents all day will buy a pack. Price packs above Cloudflare's token price so a pack cannot be resold at cost.

## Backups, export, and deletion

The owner backup in Workspace Settings already exports this installation: ordered D1 SQL fragments and every R2 object, as a TAR, to the browser or to an S3 destination encrypted with `AUTH_SECRET`. It does not include Worker secrets, KV, live Durable Object state, or an in-flight agent turn. That archive is the customer export for the DPA.

The first version requires R2 so that export can include files. It does not add a scheduled platform backup. D1 Time Travel (30 days on Workers Paid) is a restore tool for Discoflare, not the customer's copy. Before the DPA is signed, add a platform job that runs the same export into a Discoflare-owned bucket the workspace cannot read, or document that the customer must download a backup themselves.

Deletion, when it is automated:

1. Suspend routing so the hostname stops serving.
2. Offer the export, or confirm one exists, and keep it for the retention window (30 days is the proposal).
3. Delete the dispatch script. That deletes the script's Durable Object storage.
4. Delete that workspace's D1 database, R2 bucket, and KV namespace.
5. Delete `status:<slug>` and `script:<slug>`.
6. Delete the control-plane row except the billing record required for tax.
7. Do not delete the customer's own S3 backup destination. The self-host uninstaller already leaves that alone.

A self-hosted delete still goes through the account-local Admin. Hosted delete must not call that path.

DPA facts to disclose:

- The isolation boundary is logical (separate D1, R2, KV, and Durable Object namespaces) inside one Discoflare Cloudflare account. It is not the dedicated-account boundary that self-hosting gives.
- Subprocessors for the first version are Cloudflare (compute, storage, Workers AI) and Polar (billing). RealtimeKit and Browser Run are not on the path yet. A BYO model provider would be a further subprocessor chosen by the customer.
- `AUTH_SECRET` is per workspace. Provider secrets and the S3 backup secret are AES-GCM under that key, as they are today.
- Workers Logs and AI Gateway logs are account-scoped. Do not log message bodies. Give a customer their export, not a slice of the account log stream, until logpush can be filtered per script tag.
- Region and D1 jurisdiction (EU or otherwise) are unset. Pick a jurisdiction before selling to customers who need one. It has to be chosen when the database is created.

## Updates

User Workers do not support gradual deployments. Each upload goes to 100 percent of that script.

A hosted release is the same GitHub Release artifact as self-host, which is why the capability flag lives on that manifest. The rollout is:

1. Deploy the dispatch Worker only when its contract changes. It is one script.
2. Run the new D1 migrations on one canary database.
3. Upload the new user Worker to the canary with `keep_bindings` for secrets, the same way `deployDiscoflareUpdate` preserves a self-hosted install.
4. Upload the rest in small batches. A failed health check (`/api/setup/health` version and `migrated`) pins that workspace to the previous script and stops the batch.

Self-host updates stay on the Admin and are not driven by this loop. Do not edit a migration that is already on `main`. Hosted and self-host share `drizzle/migrations`, so a hosted canary that applies a migration is applying the same SQL a self-hosted Admin would apply.

## One codebase

| Concern | Self-host | Hosted |
| --- | --- | --- |
| Who deploys | Account-local Admin, or a manual Wrangler deploy | `provisionHostedWorkspace` from discoflare.com |
| Cloudflare credential | Admin's D1, encrypted | Control plane only |
| Public hostname | `workers.dev` or a customer zone | `slug.hosted.discoflare.com` |
| Agent spend | The customer's Workers AI bill | Ledger in `TICKETS` |
| Files | Optional R2 | Required R2 |
| Browser, mail, Live, Access | As the operator configures them | Off until a later phase |

No second Worker bundle. The release manifest gains `hosted-workspace-v1` and remains valid for self-host; nothing requires the flag to be absent.

## Cost

Prices below are Cloudflare's published rates as of early October 2026. They are account-level, so a quiet tenant often has a marginal cost of pennies until the account leaves the included tier. The fixed platform cost is Workers Paid ($5) plus Workers for Platforms ($25), which includes 20 million requests, 60 million CPU milliseconds, and 1,000 scripts. Further scripts are $0.02 each. Static asset requests are free. The dispatch hop and the user Worker count as one request.

| | Idle workspace | Quiet team | Agent-heavy, at the cap |
| --- | --- | --- | --- |
| Script | $0 inside 1,000 scripts, else $0.02 | same | same |
| Worker requests and CPU | ~$0 | inside the plan at low tenant counts | still small next to inference |
| D1 | megabytes, inside 5 GB included | rows inside 25 billion reads / 50 million writes until many tenants | same, plus agent queries |
| R2 | empty | $0.015/GB-month after the 10 GB account free tier | attachments can dominate if backups are neglected |
| Durable Objects | hibernating sockets are not billed for idle time | presence alarms while people are online; usually cents | agent DO storage is small |
| Workers AI | $0 | the actual risk | **stops near $5**, plus one-turn overshoot |
| Browser, Live, email | $0 because they are not bound | $0 | $0 |
| Hostname | $0 | $0 | $0 |

A Durable Object that fails to hibernate is the non-AI surprise. Channel and workspace sockets use `acceptWebSocket` and an auto ping/pong, which is the hibernation API. The workspace presence alarm runs once a minute only while an authenticated socket is attached. Confirm hibernation on a real hosted script before launch; a socket that stays active for a working day is the duration example in Cloudflare's pricing that reaches tens or hundreds of dollars.

Inference is the planned variable cost. The ledger exists so a $49 subscription cannot consume an unbounded Workers AI bill. $5 included is a starting point that leaves margin if the rest of the tenant stays near zero. Revisit it after the canary's real token logs, not before.

## Risks

- **No namespace yet.** The provisioner is untested against a live dispatch upload. The first purchase should be a canary script, not a customer.
- **Trusted namespace.** We control the code, which is why trusted mode is appropriate, and why customers must never upload their own script into `discoflare-hosted`.
- **Outbound `fetch` from Durable Objects is not intercepted** by an Outbound Worker. Do not rely on an Outbound Worker to meter model calls. The gate is inside `DiscoflareThink`, which is the only agent path.
- **Allowance races and missing usage fields.** Covered above. Reconcile KV against the Workers AI dashboard during the canary.
- **Account-wide blast radius.** A Workers AI rate limit, a D1 account storage cap (1 TB until raised), or a bad release hits every hosted workspace. Self-host customers are unaffected.
- **Logs.** Account-wide logs can contain URLs and errors. Audit `console` output before the DPA.
- **R2 must already be enabled** on the hosted account. Creating the first bucket fails otherwise. The self-host installer already treats R2 as a separate Cloudflare subscription.
- **10 GB D1 cap** cannot be raised. A single chatty workspace can fill it. The product needs an operator alarm before it needs sharding.
- **KV lookup is one page.** Reusing a ticket namespace scans the first page of account namespaces. Paginate that list before the account has more namespaces than one response returns.
- **Deletion is not automatic.** A canceled subscription only pauses the hostname. Forgetting the retention job retains data past the promise in the DPA.
- **Smart placement is not set** on the phase-1 upload. Chat latency will be poor if the Worker runs far from its D1 primary.

## Open questions

- Which Cloudflare account is the hosted account, and who is allowed to hold the API token?
- Is the apex `hosted.discoflare.com`, or a hostname that does not share a zone with the marketing site?
- Is $5 the included allowance, and what micros does each usage pack add?
- How long is the post-cancel retention window, and who is allowed to run deletion?
- Does the first customer need an EU D1 jurisdiction?
- When Browser Run and Live come back, are they inside the $49 or separate meters?
- Will BYO keys be a discount, or only a way to exceed the included model list?

## Phases

**Phase 1, this pull request.** The provisioner, the allowance gate, the dispatch router, and this document. No customer can be created until the blockers above are cleared.

**Phase 2, the first paid workspace.** Buy Workers for Platforms. Create the namespace, zone, dispatch Worker, and routing KV. In `discoflare-com`, verify Polar webhooks and call `provisionHostedWorkspace`, `addHostedAgentCredit`, and `setHostedWorkspaceRouting`. Canary one internal slug. Claim the owner, send a message, exhaust a tiny allowance, restore it with a pack, suspend, and unsuspend. Download a backup and confirm it contains only that workspace.

**Phase 3, operate it.** Batched upgrades with health checks. Platform backup job. Deletion after the retention window. D1 jurisdiction. AI Gateway as the account backstop. Placement set to smart. Log review for the DPA.

**Later.** Custom hostnames via Cloudflare for SaaS. Email through one platform mail Worker. Live with a minute cap. Browser Run with a time cap. BYO model keys. A service binding from the user Worker to Hosted Control for actions that today go to the Admin.

Self-host does not wait on these phases. A release that includes `hosted-workspace-v1` is still a normal self-hosted release.
