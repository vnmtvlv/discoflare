# Worker Previews

Every same-repository pull request targeting `main` gets one Cloudflare Worker
Preview. The Preview follows the PR head commit and is separate from releases,
the production deployment, and `sandbox.discoflare.com`.

Cloudflare Workers Builds does not need a Git repository connection for this
flow. GitHub Actions runs Wrangler directly, and the workflow posts both the
stable PR Preview URL and the immutable deployment URL on the pull request.

## Agent workflow

Coding agents use the same path regardless of whether they run in Codex,
Claude Code, or another repository-aware environment:

1. Start a focused branch or isolated worktree from current `origin/main`.
2. Implement and validate one feature or fix without changing production.
3. Push the branch to this repository and open a pull request targeting `main`.
4. Wait for CI and **Deploy PR Preview** to pass.
5. Read the single **Worker Preview** bot comment on the pull request. Test the
   feature at its stable `pr-<number>.dev.discoflare.com` URL; use the exact
   deployment URL when a commit-specific result is needed.
6. Report the PR, Preview URL, checks, and tested behavior to the user. Keep the
   PR open until the user has finished testing or explicitly asks to merge it.

Agents do not create release tags or deploy `sandbox.discoflare.com` as part of
feature development. Updating the PR branch updates the same Preview and the
same isolated resources automatically.

### Migration PRs

Feature work can happen in parallel, but D1 migrations form one ordered,
append-only log. The last migration on `main` owns the latest number; a number
chosen from an older branch is provisional until that branch is integrated.

Before marking a migration PR ready to merge:

1. Update the branch from current `origin/main`.
2. If another migration has landed, renumber the branch's new migration so it
   starts immediately after the latest migration on `main`.
3. Use `pnpm db:migration:create <lowercase_name>` for a new migration instead
   of choosing a number manually.
4. Run `pnpm db:migrations:check` and the normal test suite.
5. Push the updated branch and wait for its Worker Preview to be rebuilt before
   reporting it ready.

Migration SQL already present on `main` is immutable. The `migrations` CI check
rejects changed or deleted history, duplicate numbers, gaps, stale numbering,
and migration chains that cannot be applied to a fresh local D1 database. Main
requires branches to be current before merge, so migration PRs integrate one at
a time even while their feature work and initial Previews run in parallel.

After adding a migration file, add its raw import to the ordered bootstrap
registry in `server/utils/db.ts`. The migration check verifies that this
registry exactly matches the migration directory. A release later applies every
migration merged since the previous release in sequence.

## GitHub environment

Create a GitHub Actions environment named `preview` with:

- Secret `CLOUDFLARE_API_TOKEN`: a scoped token that can deploy Worker Previews
  and create, inspect, and delete the D1, R2, and KV resources below.
- Variable `CLOUDFLARE_ACCOUNT_ID`: the target Cloudflare account identifier.
- Secret `DISCOFLARE_PREVIEW_AUTH_SECRET`: a stable random value containing at
  least 32 characters.
- Secret `DISCOFLARE_PREVIEW_ADMIN_EMAIL`: the account used to sign in to each
  Preview.
- Secret `DISCOFLARE_PREVIEW_ADMIN_PASSWORD`: the shared Preview owner password,
  containing at least 12 characters.
- Secret `OPENROUTER_API_KEY`: the key used by the E2E PR Preview job.
- Optional variable `DISCOFLARE_E2E_MODEL`: an OpenRouter model with tool-call
  and image support. Defaults to `openai/gpt-6-luna`.

Do not configure required reviewers or a wait timer unless every Preview should
require manual approval. Repository secrets are not required for this workflow.

The Cloudflare token needs edit access to Workers Scripts, D1, Workers R2
Storage, and Workers KV Storage. Scope it to the account used by
`discoflare-sandbox`. The workflow deploys to the Preview hosts already
configured on the parent Worker; it does not create or edit DNS records.

Before the first run, open `discoflare-sandbox` in the Cloudflare dashboard,
select **Domains**, and turn on **Preview** under **Worker URL**. This is a
one-time setting on the parent Worker. Without it Cloudflare creates the
Preview and its deployment, but returns no usable URL.

The parent Worker also has `dev.discoflare.com` configured for Preview traffic
only, so PR `42` is available at `pr-42.dev.discoflare.com`. The matching
Wrangler route is tracked with production disabled to keep later production
deployments from removing the Dashboard-managed setting or routing production
traffic to that hostname.

## Isolation

For PR `42`, the workflow creates or reuses these disposable resources:

```text
Worker Preview  pr-42
D1              discoflare-preview-pr-42-db
R2              discoflare-preview-pr-42-files
KV              discoflare-preview-pr-42-tickets
```

Cloudflare creates isolated Durable Object namespaces and storage for each
Preview. AI and Browser bindings use the account services without separate
storage. Production routes, cron triggers, D1, R2, KV, secrets, and
`PUBLIC_ORIGIN` are not available to Preview code.

The workflow applies the branch's D1 migrations, builds the Worker, deploys the
Preview, and verifies `/api/setup/health` before posting its URL. The Preview
uses built-in invite-only authentication with one bootstrapped owner:

```text
Email     DISCOFLARE_PREVIEW_ADMIN_EMAIL from the preview environment
Password  DISCOFLARE_PREVIEW_ADMIN_PASSWORD from the preview environment
```

Treat the generated URL as a shared test environment. The application login is
the initial access boundary; Cloudflare Access can be added later if the URL
itself must be private.

## End-to-end tests

After deployment and health checks, **E2E PR Preview** runs Chromium on a
GitHub-hosted Ubuntu runner against the immutable deployment URL for that PR
commit. It uses the Preview owner login and receives only the OpenRouter key
and test credentials; it has no Cloudflare deployment credential.

Add the model key in **Settings → Environments → preview → Environment
secrets**, named `OPENROUTER_API_KEY`. The job uses the repository's pinned
TesterArmy e2e packages in `packages/e2e`. It signs in, opens two independent
browser contexts as the Preview owner, and checks:

- a scripted message arrives as a channel WebSocket frame and renders in the
  second client without navigation or reload;
- an OpenRouter agent can send a fresh message with the same delivery checks;
- each message persists exactly once after reloading the sender.

Each run removes its own test messages afterward. These checks cover delivery
between two connections of one account; they do not yet cover permissions or
delivery between different members.

Verified agent actions are cached between successful runs of the same PR.
Unique message values are substituted on replay. Cache misses and stale
recordings use the model again; exact assertions remain in every run.
The agent is limited to eight actions and eight model calls per goal, with no
automatic retries. The job summary reports usage and cache hits; reports and
traces are uploaded as seven-day Actions artifacts even when tests fail.
Fork pull requests do not run this job or receive its credentials.

For a local run, set the target and credentials in an ignored `.env.e2e`:

```dotenv
APP_URL=http://127.0.0.1:3000
E2E_USER_ADMIN_USERNAME=owner@example.test
E2E_USER_ADMIN_PASSWORD=your-test-password
# Set these to include the OpenRouter agent scenario:
E2E_AI=1
OPENROUTER_API_KEY=your-openrouter-key
```

Start a full local Worker or select a disposable Preview, then run:

```bash
pnpm --filter @discoflare/e2e exec e2e-web install chromium
pnpm test:e2e
```

Without `E2E_AI=1`, the agent test is skipped and the scripted delivery test
needs no model key. The target URL must be an environment value; never commit
personal installation URLs or credentials.

## Cleanup

Closing or merging a pull request deletes its Worker Preview, KV namespace, and
D1 database. The R2 bucket has a one-day expiration rule; if it still contains
objects when the PR closes, a daily sweep retries deletion after expiration.

Fork pull requests do not receive credentials or deploy a Preview. CI still
runs for them.

The Preview deployment job also verifies a `pr-<number>-no-files` workspace Preview with no R2 binding (same disposable D1/KV as the regular PR Preview), and runs claim/recovery against a separate temporary Admin Worker with its own D1. The Admin smoke checks rotation, concurrent consumption, session revocation, replay rejection and throttling. It removes that Worker and D1 before the job ends. PR cleanup removes both workspace Previews.
