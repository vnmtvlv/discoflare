# Deployment

## Discoflare installer

The OAuth installer at `discoflare.com/deploy` is the complete Cloudflare path for workspace mail. The operator selects an account, an active zone such as `example.com`, the app label such as `chat`, an email subdomain, the first mailbox local part such as `inbox`, and the intended owner email. Installation then:

1. refuses to replace a custom hostname attached to another Worker, non-Cloudflare MX records, or another enabled catch-all email route;
2. enables Cloudflare Email Routing and Email Sending for the selected email subdomain;
3. deploys Discoflare with a `MAIL_EMAIL` send binding, mail-domain variables, the intended owner email, and a random private owner-setup claim;
4. attaches `chat.example.com` to the Worker and routes catch-all email for the configured mail domain to it;
5. opens a private setup link on `chat.example.com`, where the intended owner creates their name and password; and
6. creates the owner, workspace, and first mailbox in one bootstrap transaction before marking the workspace ready.

The encrypted installer session holds the OAuth access token only during installation. The installed Worker receives no Cloudflare API token. The setup claim travels in the workspace URL fragment and is cleared from the address bar before the owner submits it. Additional mailbox addresses and member/Agent access are managed in **Workspace Settings → Email** without DNS changes or redeployment.

The Cloudflare OAuth client registered for `discoflare.com` must allow Zone Read, Zone Settings Read/Write, DNS Read/Write, Email Routing Rules Read/Write, and Email Sending Read/Write permissions requested by the installer. Updating the requested scope string in the app does not expand an already-registered OAuth client; update that client in Cloudflare before deploying this installer version.

Enabling Email Routing makes Cloudflare the MX provider for the selected email subdomain. The app subdomain is mirrored by default but can be changed independently. The installer deliberately stops instead of replacing existing non-Cloudflare MX records.

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

The Worker can become live before the Sandbox image finishes provisioning. Allow several minutes before the first Agent Task. Agents need a Workers Paid account with Containers enabled. The default `@cf/moonshotai/kimi-k2.7-code` model uses the account's Workers AI binding, so no external model API key is required.

`APP_NAME` changes the name beside the hardcoded Discoflare logo and the browser title. `APP_TITLE` changes the login headline; use `\n` to split it across two lines. `APP_SUBTITLE` changes the supporting copy below it. These are public display values, not secrets.

To complete first-owner setup after the manual GitHub deployment:

1. Confirm `ADMIN_EMAIL`, a random 32-character-or-longer `ADMIN_SETUP_TOKEN`, and `AUTH_SECRET` are configured as Worker secrets.
2. Open `/setup#claim=<ADMIN_SETUP_TOKEN>` on the resulting Worker URL.
3. Create the owner name and password there. The workspace becomes ready and signs the owner in.
4. Open **Workspace Settings → Authentication** to choose invite-only or open registration and configure login methods.
5. Open **Workspace Settings → Huddles** to configure RealtimeKit only if the workspace needs huddles; text chat works without it.
6. Open **Tasks**, create an Agent and a Task Board, assign a Task, and run it. If the first run reports that the Sandbox is unavailable immediately after deploy, wait for container provisioning and retry the Task.

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

Email login works for an existing verified account without email delivery. New email signup requires all of the following:

1. Onboard the sender domain in Cloudflare Email Service.
2. Add a Worker send binding named `EMAIL`. The guided installer does not provision this login-email binding automatically.
3. Set a sender in the Authentication UI, or set `EMAIL_FROM` as a deployment value.
4. Configure and enable Turnstile.
5. Select **Open signup**, or send the person an Invite.

After the `EMAIL` binding exists, signup policy, sender, provider credentials, and enabled methods can be changed in the app without a source rebuild or redeploy. If credentials are instead stored as Worker secrets, updating them creates a new Worker version by design.

Password reset follows the same delivery boundary: the link appears only when email login is enabled and both the `EMAIL` binding and verified sender are available. Reset links expire after one hour and completing a reset revokes the account's existing sessions.

For a manual Wrangler config, restrict the binding to the verified sender:

```jsonc
"send_email": [{
  "name": "EMAIL",
  "allowed_sender_addresses": ["login@example.com"]
}]
```

Keep `AUTH_SECRET` stable. Rotating it invalidates sessions and makes D1-stored provider secrets unreadable; replace those secrets in the Authentication UI after a rotation.

The authentication `EMAIL` binding and workspace `MAIL_EMAIL` binding are intentionally separate. `EMAIL` may be restricted to the login sender; `MAIL_EMAIL` sends only after Discoflare's mailbox permission check.

## Secrets

The owner can configure RealtimeKit in **Workspace Settings → Huddles**. Its API token is encrypted in D1 with `AUTH_SECRET` and takes effect without a Worker redeploy. The normal settings API never returns the token; an explicit owner-only reveal action can decrypt it into the settings field and is recorded in the audit log. **Test connection** validates the account, app, token, and configured presets with a read-only RealtimeKit API request. Deployment values remain supported, override settings entered in Discoflare, and cannot be revealed in the workspace UI:

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

Sandbox-backed development is documented separately in [Sandbox development](sandbox-development.md).
