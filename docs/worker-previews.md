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

## Cleanup

Closing or merging a pull request deletes its Worker Preview, KV namespace, and
D1 database. The R2 bucket has a one-day expiration rule; if it still contains
objects when the PR closes, a daily sweep retries deletion after expiration.

Fork pull requests do not receive credentials or deploy a Preview. CI still
runs for them.
