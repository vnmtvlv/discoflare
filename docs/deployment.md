# Deployment

## Discoflare installer

The OAuth installer at `discoflare.com/deploy` is the complete Cloudflare path for workspace mail. The operator selects an account, an active zone such as `example.com`, the app label such as `chat`, and the first mailbox local part such as `inbox`. Installation then:

1. refuses to replace a custom hostname attached to another Worker, non-Cloudflare MX records, or another enabled catch-all email route;
2. enables Cloudflare Email Routing and Email Sending for the selected domain;
3. deploys Discoflare with a `MAIL_EMAIL` send binding and mail-domain variables;
4. attaches `chat.example.com` to the Worker and routes catch-all domain email to it; and
5. creates `inbox@example.com` in D1 when the workspace owner is bootstrapped.

The encrypted installer session holds the OAuth access token only during installation. The installed Worker receives no Cloudflare API token. Additional mailbox addresses and member/Agent access are managed in **Workspace Settings → Email** without DNS changes or redeployment.

The Cloudflare OAuth client registered for `discoflare.com` must allow the Zone Read, DNS Read/Write, Email Routing Rules Read/Write, and Email Sending Read/Write permissions requested by the installer. Updating the requested scope string in the app does not expand an already-registered OAuth client; update that client in Cloudflare before deploying this installer version.

Enabling Email Routing makes Cloudflare the MX provider for the selected domain. Choose a separate Cloudflare zone if the main company domain already receives mail elsewhere; the installer deliberately stops instead of replacing those MX records.

## One-click

The GitHub deploy button remains a source-build fallback. It does not have a temporary Cloudflare OAuth token, so it cannot select a zone or provision the custom hostname, Email Routing rules, and Email Sending domain. Use `discoflare.com/deploy` for the complete mail-enabled installation.

```md
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/vnmtvlv/discoflare)
```

`wrangler.jsonc` declares D1, R2, KV, Durable Object classes, Workers AI, the Agent Task and Message Workflows, and the Sandbox Container application. The button clones the public repository into Workers Builds, builds the Nuxt Worker and Sandbox image, provisions the declared resources, and deploys them into the installer's Cloudflare account. Cloudflare also reads `.env.example` and prompts for the required owner/auth secrets. The source repository must be public for this flow.

“One click” means one repository handoff and one Cloudflare deployment flow. It does not mean every component becomes ready in the same second:

- The Worker and storage bindings are created from `wrangler.jsonc`.
- The Sandbox Docker image is built and pushed to Cloudflare's registry as part of the deploy.
- The Worker can become live before that image finishes provisioning. Allow several minutes before the first Agent Task.
- Agents need a Workers Paid account with Containers enabled.
- The default `@cf/moonshotai/kimi-k2.7-code` model uses the account's Workers AI binding, so no OpenAI, OpenRouter, Hermes, or VM-provider key is required.
- RealtimeKit, optional OAuth providers, Web Push, and verification email keep their existing optional setup because they are not required for Agent Tasks.

`APP_NAME` changes the name beside the hardcoded Discoflare logo and the browser title. `APP_TITLE` changes the login headline; use `\n` to split it across two lines. `APP_SUBTITLE` changes the supporting copy below it. These are public display values, not secrets.

For one-click deployment:

1. Enter `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, and `AUTH_SECRET` in the deploy form.
2. Open the resulting Worker URL. The first health request creates the owner and workspace when the database is empty.
3. Sign in. `/setup` reports readiness and never accepts owner credentials.
4. Open **Workspace Settings → Authentication** to choose invite-only or open registration and configure login methods.
5. Open **Workspace Settings → Huddles** to configure RealtimeKit only if the workspace needs huddles; text chat works without it.
6. Open **Tasks**, create an Agent and a Task Board, assign a Task, and run it. If the first run reports that the Sandbox is unavailable immediately after deploy, wait for container provisioning and retry the Task.

For a manual deployment, set the owner and auth secrets:

```
wrangler secret put ADMIN_EMAIL
wrangler secret put ADMIN_PASSWORD
wrangler secret put ADMIN_NAME
wrangler secret put AUTH_SECRET
```

Optional: `ADMIN_HANDLE` (used if `ADMIN_NAME` is empty), `ADMIN_WORKSPACE` (default `HQ`).

### Web Push

Generate one VAPID key pair and keep it stable for the lifetime of browser subscriptions:

```bash
pnpm vapid:generate
wrangler secret put VAPID_SUBJECT
wrangler secret put VAPID_PUBLIC_KEY
wrangler secret put VAPID_PRIVATE_KEY
```

`VAPID_SUBJECT` is normally a contact URI such as `mailto:admin@example.com`. After deployment, each Member enables Push notifications for a browser in User Settings. Notifications are sent for mentions, Direct Messages, and newly started huddles. Rotating either VAPID key invalidates existing subscriptions, so Members must enable them again.

Then run `pnpm deploy`. It applies the D1 migrations through the `DB` binding and deploys the Worker.

For Workers Builds, use `pnpm run build` as the build command and `pnpm run deploy:built` as the deploy command. The build script raises Node's heap limit for the Nuxt bundle; the deploy command reuses that output, applies D1 migrations, and deploys without building a second time.

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
2. Add a Worker send binding named `EMAIL`. This is the one platform step that one-click deployment cannot provision automatically.
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
wrangler secret put ADMIN_PASSWORD
wrangler secret put ADMIN_NAME
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

## Docker / Coolify

The root `docker-compose.yml` pulls the versioned multi-architecture image from `ghcr.io/vnmtvlv/discoflare`. It runs the chat Worker through local Wrangler/Miniflare and stores the simulated D1, R2, KV, and Durable Object state together in the `discoflare-data` volume. This mode does not emulate Cloudflare Workflows, Workers AI, or Sandbox Containers, so the Tasks UI can store boards and tasks but cannot run agents there.

Create a `.env` beside the Compose file:

```dotenv
PUBLIC_ORIGIN=https://chat.example.com
AUTH_SECRET=replace-with-a-random-32-character-or-longer-secret
ADMIN_EMAIL=owner@example.com
ADMIN_PASSWORD=replace-with-a-strong-password
ADMIN_NAME=Owner
# optional Web Push; paste the values from `pnpm vapid:generate`
VAPID_SUBJECT=mailto:admin@example.com
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
```

Then start it:

```bash
docker compose up -d
```

For Coolify:

1. Create an application from this Git repository and choose the Docker Compose build pack.
2. Use `/` as the base directory and `/docker-compose.yml` as the Compose location.
3. Keep Raw Compose disabled.
4. Set the required environment variables and route the `discoflare` service domain to container port `3000`.
5. Deploy and verify `/api/setup/health` before signing in.

`PUBLIC_ORIGIN` must exactly match the browser-facing origin, including `https://` and any non-default port, with no path. Do not scale the service above one replica: every live binding is owned by that one process and one volume. Stop the container before taking a file-level volume backup so SQLite-backed state is quiescent. Restores must replace the whole volume as one unit.

The Docker mode does not require a Cloudflare account. Text chat, recorded audio messages, and attachments remain local to the installation. RealtimeKit huddles and X sign-in are external integrations and require network access when configured. Web Push also requires outbound access to the push service selected by the browser (for example Apple, Google, or Mozilla); VAPID is authentication, not a local relay. Push therefore does not work on an air-gapped forest network, although in-app realtime continues while the browser can reach Discoflare. Browser Push and microphone capture require a secure context, so serve the installation over HTTPS (or use `localhost` while developing). Miniflare is Cloudflare's local development simulator, so this repository pins and tests the runtime version used by each Discoflare container release.

On iOS and iPadOS, install Discoflare on the Home Screen before enabling Push. Every browser requires the permission request to follow a direct user action.

Sandbox-backed development is documented separately in [Sandbox development](sandbox-development.md).
