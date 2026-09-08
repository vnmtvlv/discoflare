# Deployment

## Discoflare installer

The OAuth installer at `discoflare.com/deploy` deploys a complete workspace to the operator's Cloudflare account. A fresh install uses the account's `workers.dev` hostname and Discoflare-owned accounts by default. A custom domain, workspace mail, and Cloudflare Access are independent optional choices; an active zone is required only when a custom domain or workspace mail is enabled. Installation then:

1. reserves or reuses the account's Workers subdomain and deploys the single Discoflare Worker;
2. by default creates a private single-use Owner Setup Claim for choosing the first password, or, when explicitly selected, creates Cloudflare Access applications, an email one-time-PIN login method, and an allow policy;
3. optionally attaches the selected custom hostname and disables the public `workers.dev` route so the installation has one public origin;
4. optionally enables Cloudflare Email Routing and Email Sending on the Primary workspace Worker and refuses to replace foreign MX or catch-all configuration; and
5. optionally creates a RealtimeKit app, Discoflare voice/video presets, and a dedicated account-owned Realtime token stored only as a Worker secret; and
6. creates the Owner and workspace atomically from the private setup claim, or when the intended Owner first arrives with a verified Access identity.

The encrypted installer session holds the OAuth access token only during installation. The installed Worker receives no Cloudflare API token. The setup claim travels in the workspace URL fragment and is cleared from the address bar before the owner submits it. Additional mailbox addresses and member/Agent access are managed in **Workspace Settings → Email** without DNS changes or redeployment.

The Cloudflare OAuth client registered for `discoflare.com` must allow Access Read/Write in addition to its Worker and storage permissions. Zone, DNS, Email Routing, and Email Sending permissions remain necessary for the optional domain and mail paths. Updating the requested scope string in the app does not expand an already-registered OAuth client; update that client in Cloudflare before deploying the corresponding installer version.

Select **Cloudflare Access** only when the operator wants Cloudflare Zero Trust to own the login perimeter. Member admission is then managed in the Cloudflare Access policy rather than with Discoflare invites or signup, and changing authentication mode later requires a manual migration.

Enabling Email Routing makes Cloudflare the MX provider for the selected email subdomain. The app subdomain is mirrored by default but can be changed independently. The installer deliberately stops instead of replacing existing non-Cloudflare MX records.

Cloudflare exposes one catch-all rule per DNS zone. The installer assigns it directly to the Primary Discoflare workspace Worker, which also owns the zone's outbound Email Sending binding. The workspace accepts or rejects the complete address against its D1 mailbox registry. New Mailboxes therefore remain local D1 configuration and require neither a Cloudflare routing rule nor a redeployment. The base release refuses a second mail-enabled workspace in the same account instead of creating an auxiliary gateway Worker.

The installer returns a conflict instead of replacing a foreign catch-all. Removing the Primary workspace disables its owned catch-all and removes its exact Email Sending subdomain. Neither the OAuth installer nor the CLI leaves a Cloudflare provisioning credential in the deployed Worker.

## GitHub / Workers Builds

The GitHub deploy button remains an advanced source-build entry point. It does not use the Discoflare installer's temporary Cloudflare OAuth token or provisioning workflow. Use `discoflare.com/deploy` for the guided, mail-enabled installation.

```md
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/vnmtvlv/discoflare)
```

The button hands the public repository to Cloudflare. Everything account-specific remains the operator's responsibility. Before calling the GitHub deployment ready:

1. Fork or connect the repository to Workers Builds.
2. Create or select the D1 database, R2 bucket, and KV namespace in the target Cloudflare account.
3. Adapt `wrangler.jsonc` with unique Worker and resource names, the target resource IDs, routes, and the required Durable Object, Workflow, Workers AI, and Container bindings. Do not reuse the public sandbox's account-specific IDs or hostname.
4. Add `AUTH_SECRET`, `ADMIN_EMAIL`, and a random 32-character-or-longer `ADMIN_SETUP_TOKEN` as Worker secrets. Add optional provider, RealtimeKit, Web Push, and email values only for integrations you intend to operate.
5. Configure `pnpm run build` as the build command and `pnpm run deploy:built` as the deploy command. The deploy command applies D1 migrations before publishing the already-built Worker.
6. Attach the public hostname and manually configure any desired Email Routing, Email Sending, DNS, OAuth callbacks, and sender-domain settings.
7. Verify `/api/setup/health`, claim the first owner at `/setup#claim=<ADMIN_SETUP_TOKEN>`, and test storage, realtime, and Agent execution from the deployed origin.

The Worker can become live before the Agent Computer image finishes provisioning. Allow several minutes before the first Agent Task. The complete Discoflare release requires a Workers Paid account because every Agent has a Container-backed Computer. The default `@cf/moonshotai/kimi-k2.7-code` model uses the account's Workers AI binding, so no external model API key is required.

`APP_NAME` changes the name beside the hardcoded Discoflare logo and the browser title. `APP_TITLE` changes the login headline; use `\n` to split it across two lines. `APP_SUBTITLE` changes the supporting copy below it. These are public display values, not secrets.

To complete first-owner setup after the manual GitHub deployment:

1. Confirm `ADMIN_EMAIL`, a random 32-character-or-longer `ADMIN_SETUP_TOKEN`, and `AUTH_SECRET` are configured as Worker secrets.
2. Open `/setup#claim=<ADMIN_SETUP_TOKEN>` on the resulting Worker URL.
3. Create the owner name and password there. The workspace becomes ready and signs the owner in.
4. Open **Workspace Settings → Authentication** to choose invite-only or open registration and configure login methods.
5. Open **Workspace Settings → Huddles** to configure RealtimeKit only if the workspace needs calls or huddles; text chat works without it.
6. Open **Tasks**, create an Agent and a Task Board, assign a Task, and run it. If the first run reports that its Computer is unavailable immediately after deploy, wait for container provisioning and retry the Task.

### MCP access

The Owner can open **Workspace Settings → MCP**, copy the installation URL ending in `/mcp`, and create a named access token for Codex or another MCP client. Choose which active Human or Agent the token acts as and grant only the Task and Document scopes it needs. The endpoint uses stateless Streamable HTTP. Clients authenticate each request with `Authorization: Bearer <token>`.

Copy the token when it is created because its raw value is never stored or shown again. D1 retains only a SHA-256 digest and the token's fixed Task and Document scopes. The Worker also checks that the issuing Member is still active and still has the necessary current Role Grant for each tool. Revoke unused or exposed tokens from the same settings section; revocation is immediate and token creation and revocation appear in the Audit Log.

### Manual workspace backups

The owner can open **Workspace Settings → Backups** and create a streaming TAR archive in either of two places: download it to the current device, or upload it manually to a configured S3-compatible bucket. The Worker exports D1 as ordered SQL fragments and streams every object from its bound R2 bucket into the archive with a metadata sidecar that preserves the original R2 key, HTTP metadata, custom metadata, ETag, size, and upload timestamp.

To restore D1, concatenate `database/*.sql` in filename order into one `restore.sql` and import that entire file into an empty database with `wrangler d1 execute <database-name> --remote --file=restore.sql`. Do not import the fragments separately: related rows and cycles require deferred foreign-key checks across the complete import. Restore each numbered R2 `.bin` object under the original key and metadata from its adjacent `.json` file. Confirm `summary.json` is present before using the archive.

Device downloads may take a long time and require the browser connection to remain open. Bucket uploads use the destination's S3 multipart API and also run only while the manual request remains connected; no scheduled backup is configured. Use a separate private destination bucket rather than the R2 bucket bound as `FILES`, so backups do not recursively include older backups and do not share the same failure boundary as live files.

The S3 Endpoint, Region, Bucket, Prefix, Access Key ID, and Secret Access Key are entered in the owner UI. The Secret Access Key is AES-GCM encrypted in D1 using `AUTH_SECRET`, is never returned by the API, and can be tested with a temporary upload/delete operation. Keep the workspace idle until either backup operation completes. The archive contains authentication records and workspace content, so store it as sensitive data. It does not include Worker environment secrets, KV tickets, Durable Object live state, running Agent turns, or external RealtimeKit data. A usable disaster-recovery set therefore also preserves `AUTH_SECRET` and the deployment configuration separately.

### Managed server deletion

Only the workspace Owner can start deletion from **Workspace Settings → Danger Zone**. The UI offers the Backups section first; backup remains optional. Managed installations create a random 15-minute, one-use deletion claim in the installation KV and carry it to `discoflare.com/uninstall` in the URL fragment. The installer then uses a temporary Cloudflare OAuth session, finds exactly one marked Discoflare Worker by its hostname, displays the matched resources, and requires the full server origin to be typed before deletion.

The installer presents the claim back to the installed Worker immediately before deletion. The Worker consumes it and empties its live `FILES` bucket through the R2 binding in batches. The installer removes the Access applications recorded on that installation, disables its owned mail catch-all and exact Email Sending subdomain, detaches the custom Worker domain, and permanently removes the Worker with its Durable Object state plus the managed D1, R2, KV, Workflow, and Container resources. It never follows or deletes the independently configured S3 backup destination. Unrelated DNS or email rules are left alone.

Manual deployments are not automatically destroyed: bindings may point to shared or operator-managed resources, and the application has no reliable ownership marker for each of them. Their Danger Zone links to the Cloudflare dashboard for manual cleanup.

For a manual deployment, set the owner and auth secrets:

```
wrangler secret put ADMIN_EMAIL
wrangler secret put ADMIN_SETUP_TOKEN
wrangler secret put AUTH_SECRET
```

Open `/setup#claim=<ADMIN_SETUP_TOKEN>` on the deployed origin. Optional: `ADMIN_WORKSPACE` (default `HQ`). `ADMIN_PASSWORD`, `ADMIN_NAME`, and `ADMIN_HANDLE` remain supported only for legacy unattended bootstrap.

### Web Push

Generate one VAPID key pair and keep it stable for the lifetime of browser subscriptions:

```bash
pnpm vapid:generate
wrangler secret put VAPID_SUBJECT
wrangler secret put VAPID_PUBLIC_KEY
wrangler secret put VAPID_PRIVATE_KEY
```

`VAPID_SUBJECT` is normally a contact URI such as `mailto:admin@example.com`. After deployment, each Member enables Push notifications for a browser in User Settings. Notifications are sent for mentions, Direct Messages, and newly started huddles. Rotating either VAPID key invalidates existing subscriptions, so Members must enable them again.

On iOS and iPadOS, install Discoflare on the Home Screen before enabling Push. Every browser requires the permission request to follow a direct user action.

Then run `pnpm deploy`. It applies the D1 migrations through the `DB` binding and deploys the Worker.

### Anonymous project heartbeat

The guided installer configures `DISCOFLARE_TELEMETRY_ID`, `DISCOFLARE_TELEMETRY_TOKEN`, and a weekly Cron Trigger. The scheduled request contains only the random installation ID, version, timestamp, and boolean capability flags. The workspace owner can disable it in **Workspace Settings → Telemetry**; the scheduled handler then makes no outbound request.

Manual deployments have the same Cron Trigger but no telemetry credentials, so they do not report by default. To opt a manual deployment in, provision a unique ID and secret with the project registry and configure the corresponding Worker values.

The build script raises Node's heap limit for the Nuxt bundle; the deploy command reuses that output instead of building a second time.

The agent runtime adds no required secret. `AGENT_MODEL` is an optional public Worker variable; each Agent profile may override it with another Workers AI model id.

## Authentication

The owner can configure GitHub, X, Telegram, and Turnstile in **Workspace Settings → Authentication**. Client secrets entered there are encrypted in D1 with AES-256-GCM under a key derived from `AUTH_SECRET`. The API never returns saved secrets.

Alternatively, set a provider's client ID and secret as Worker secrets. Deployment values override D1 and appear as **Managed by deployment** in the UI:

```
GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
TWITTER_CLIENT_ID / TWITTER_CLIENT_SECRET
TELEGRAM_CLIENT_ID / TELEGRAM_CLIENT_SECRET
TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY
```

OAuth callbacks are:

```
https://your-domain.example/api/auth/callback/github
https://your-domain.example/api/auth/callback/twitter
https://your-domain.example/api/auth/callback/telegram
```

The callback origin must be the deployed workspace URL. `discoflare.com` is the separate marketing site, not an authentication callback host. In invite-only mode, a new identity remains pending until it accepts an invite. In open mode, it becomes an active Member immediately.

### Verification and password-reset email

Email delivery is not required to create the Owner or to create an account from a private invite link. The invite itself is the admission credential; verification and password reset remain unavailable until auth-email delivery is configured. To verify new addresses and enable password reset:

1. Onboard the sender domain in Cloudflare Email Service.
2. Add a Worker send binding named `EMAIL`, or use the guided installer's Primary workspace mail binding.
3. Set a sender in the Authentication UI or with `EMAIL_FROM`. Guided mail-enabled installations default to their initial workspace mailbox address.
4. Configure and enable Turnstile.
5. Keep **Invite only** or select **Open signup**, according to the workspace admission policy.

After an email binding exists, signup policy, sender, provider credentials, and enabled methods can be changed in the app without a source rebuild or redeploy. If credentials are instead stored as Worker secrets, updating them creates a new Worker version by design.

Password reset follows the same delivery boundary: the link appears only when email login is enabled and both an email binding and verified sender are available. Reset links expire after one hour and completing a reset revokes the account's existing sessions.

For a manual Wrangler config, restrict the binding to the verified sender:

```jsonc
"send_email": [{
  "name": "EMAIL",
  "allowed_sender_addresses": ["login@example.com"]
}]
```

Keep `AUTH_SECRET` stable. Rotating it invalidates sessions and makes D1-stored provider secrets unreadable; replace those secrets in the Authentication UI after a rotation.

For manual deployments, the authentication `EMAIL` binding and workspace `MAIL_EMAIL` binding are intentionally separate. `EMAIL` may be restricted to the login sender; `MAIL_EMAIL` sends only after Discoflare's mailbox permission check. Guided installations instead send workspace and default authentication email through the domain-restricted zone gateway.

## Secrets

The guided installer can provision RealtimeKit when **Huddles** is selected. Cloudflare requires the operator to create a narrow API token with **Account → Realtime → Edit** first. The installer uses that token transiently to create app-specific Discoflare presets with recording, transcription, livestreaming, plugins, polls, and RealtimeKit chat disabled, then writes it directly to the Worker as `REALTIMEKIT_API_KEY`; `discoflare.com` does not retain it. Because Cloudflare currently exposes no RealtimeKit app deletion API and cannot revoke an operator-created token without receiving it again, managed uninstall reports both for manual cleanup.

The owner can instead configure RealtimeKit in **Workspace Settings → Huddles**. Its API token is encrypted in D1 with `AUTH_SECRET` and takes effect without a Worker redeploy. The normal settings API never returns the token; an explicit owner-only reveal action can decrypt it into the settings field and is recorded in the audit log. **Test connection** validates the account, app, token, and configured presets with a read-only RealtimeKit API request. Calls and huddles use the audio/video preset so participants can turn cameras on without replacing the live session; they enter audio-first. Discoflare does not enable RealtimeKit recording or transcription. Deployment values remain supported, override settings entered in Discoflare, and cannot be revealed in the workspace UI:

```
wrangler secret put ADMIN_EMAIL
wrangler secret put ADMIN_SETUP_TOKEN
wrangler secret put AUTH_SECRET
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put TWITTER_CLIENT_ID
wrangler secret put TWITTER_CLIENT_SECRET
wrangler secret put TELEGRAM_CLIENT_ID
wrangler secret put TELEGRAM_CLIENT_SECRET
wrangler secret put TURNSTILE_SITE_KEY
wrangler secret put TURNSTILE_SECRET_KEY
wrangler secret put VAPID_SUBJECT
wrangler secret put VAPID_PUBLIC_KEY
wrangler secret put VAPID_PRIVATE_KEY
wrangler secret put REALTIMEKIT_ACCOUNT_ID
wrangler secret put REALTIMEKIT_APP_ID
wrangler secret put REALTIMEKIT_API_KEY
wrangler secret put REALTIMEKIT_PRESET_VOICE
# optional
wrangler secret put REALTIMEKIT_API_SECRET
wrangler secret put REALTIMEKIT_PRESET_AV
```

`REALTIMEKIT_API_SECRET` is only for the legacy Basic Auth API path. The current Cloudflare API-token path uses `REALTIMEKIT_ACCOUNT_ID`, `REALTIMEKIT_APP_ID`, and `REALTIMEKIT_API_KEY`. Never put RealtimeKit secrets in the client bundle.

## Local

```
pnpm install
pnpm env:init
pnpm db:migrate:local
pnpm dev
```

Full realtime locally:

```
pnpm dev:full
```

Remote development is documented separately in [Remote development](remote-development.md).
