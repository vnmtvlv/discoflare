# Worker Previews

Every same-repository pull request targeting `main` can receive an isolated
Cloudflare Worker Preview without creating a version tag or GitHub Release.
The stable Preview URL follows the latest commit in the pull request; the PR
comment also records an immutable deployment URL for the exact commit.

This is a development environment, not a Discoflare release. Installer
artifacts remain release-tagged and immutable.

## Agent workflow

Use one worktree, branch, and pull request for each feature agent. The pull
request number is the disposable environment identity, so agents never share
Preview storage. Every push updates the stable PR URL while retaining an
immutable deployment URL for that commit. Closing the pull request starts
cleanup. No step creates a version tag, GitHub Release, or installer artifact.

## One-time setup

Worker Previews require Wrangler 4.135.0 or later. This repository pins a newer
compatible version. `wrangler.jsonc` explicitly opts the sandbox Worker into
Preview URLs and declares Preview configuration. `wrangler preview` can create
the first Preview without deploying the Worker to production.

Protect the sandbox Worker's Preview deployments with a Preview-only Cloudflare
Access application before opening the workflow to contributors. Preview URLs
are public by default. Add a service-token policy for CI health checks alongside
the human reviewer policy. The application inside the outer Access boundary is
invite-only and bootstraps one test Owner from deployment configuration.

Configure these GitHub Actions secrets:

- `CLOUDFLARE_PREVIEW_API_TOKEN` — a token scoped to the sandbox account with
  permission to edit Workers scripts, D1, R2, KV, and Containers. Do not reuse a
  tenant installer or production control-plane credential.
- `CLOUDFLARE_PREVIEW_ACCOUNT_ID` — the account containing
  `discoflare-sandbox`.
- `DISCOFLARE_PREVIEW_AUTH_SECRET` — a random value of at least 32 characters.
- `DISCOFLARE_PREVIEW_ADMIN_PASSWORD` — the shared test Owner password, at
  least 8 characters, delivered to reviewers through the team's secret manager
  rather than a PR comment.
- `DISCOFLARE_PREVIEW_ACCESS_CLIENT_ID` and
  `DISCOFLARE_PREVIEW_ACCESS_CLIENT_SECRET` — credentials for a Cloudflare
  Access service token admitted by the Preview-only policy. They are used only
  by the post-deploy health check.

Optionally set the `DISCOFLARE_PREVIEW_ADMIN_EMAIL` repository variable. It
defaults to `preview@discoflare.invalid`.

Secrets are not available to pull requests from forks. The workflow explicitly
skips those pull requests instead of exposing Cloudflare credentials.

## Pull request lifecycle

`.github/workflows/preview.yml` performs the following work for PR `42`:

1. Creates or reuses `discoflare-preview-pr-42-db`,
   `discoflare-preview-pr-42-files`, and
   `discoflare-preview-pr-42-tickets`.
2. Generates ignored deployment and migration configs at the repository root,
   where Wrangler resolves the app's existing relative paths correctly. Runtime
   secrets and command output remain under `.preview/`.
3. Applies the branch's D1 migrations to the isolated database.
4. Builds the Nuxt Worker and runs `wrangler preview --name pr-42`.
5. Calls `/api/setup/health`, which also bootstraps the test Owner, and requires
   isolated D1, R2, and KV bindings to be healthy.
6. Creates or updates one PR comment with the stable and immutable URLs.

Durable Objects and Containers are isolated automatically by Cloudflare.
Production routes, Cron Triggers, email bindings, integration secrets, and
production storage are not copied into the Preview configuration.

Cloudflare Workflows are intentionally omitted. A Preview binding would call an
already-deployed Workflow with its own code, bindings, and instances instead of
the branch implementation. Consequently Agent Computer is disabled in the
Preview and `/api/setup/health` must report `agentWorkflow: false`. Changes to
`AgentTaskWorkflow` still require a separately deployed disposable full
environment.

## Cleanup

Closing a PR deletes its Preview and any generated container applications. The
workflow then deletes the isolated R2, KV, and D1 resources, with D1 deleted
last so it remains a cleanup marker if an earlier operation needs retrying.

An R2 bucket cannot be deleted while it contains attachments. Each Preview
bucket therefore receives a one-day object-expiration rule. If the bucket is
not empty when the PR closes, resource deletion remains pending. A daily sweep
retries cleanup for resource names whose PR is no longer open.

All destructive operations derive exact names from a validated numeric PR ID;
the cleanup code never deletes by a broad Worker-name prefix.

## Local validation

The resource scripts can be tested without a Cloudflare account:

```bash
pnpm test -- tests/unit/preview-resources.test.ts
pnpm lint
pnpm typecheck
pnpm build
```

Creating a real Preview is an authenticated Cloudflare mutation and is only
performed by the GitHub workflow after the repository secrets and Access policy
have been configured.
