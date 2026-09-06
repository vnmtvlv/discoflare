# Release process

`main` is the protected, releasable Discoflare trunk. Completed work accumulates
there through short-lived feature and fix branches. It may be ahead of the
latest published version; immutable version tags identify released code.

## Branch flow

```text
feature/audio-messages ─┐
feature/another-change ─┼─> PR ─> main ─> release PR ─> tag and GitHub Release
fix/a-bug              ─┘
```

- Branch from current `main` and open focused feature and fix PRs directly back
  to `main`.
- Keep `main` green and releasable. Incomplete work stays on its branch or behind
  an explicit feature boundary.
- Squash feature and fix PRs so `main` contains one reviewable commit per change.
- Accumulate any number of completed changes before publishing a release.
- Use a short-lived release branch only for version, release-note, or other
  release-specific edits. It is not a second review of already merged changes.

## Pull request checks

`.github/workflows/ci.yml` runs on every PR targeting `main` and on pushes to
`main`. It installs the lockfile dependencies with Node.js 24 and pnpm 10.30.3,
then runs four independent checks: `lint`, `typecheck`, `test`, and `build`.
Failed checks do not cancel the other checks; a newer update to the same PR or
branch cancels its superseded run.

Node.js 24 is required for these checks because the backup tests use
`node:sqlite` to read text containing NUL bytes; Node.js 22 truncates those
values when returning them to JavaScript. CI uses Vitest's default text
reporter because the GitHub annotations reporter crashes the runner while
reporting the large Unicode diff from that failing test.

Configure the GitHub ruleset targeting `main` to require those four checks from
GitHub Actions. Require PRs and resolved review conversations, allow only squash
merges, block force pushes and deletion, and keep required approvals at zero
while the maintainer is the only reviewer.

CI builds the Worker without deploying or applying remote migrations. Sandbox
browser checks and release artifact verification remain separate release gates.

## Preparing a release

When `main` contains the intended release contents, create a short-lived release
branch from it. The release PR must:

1. Pass lint, type checking, tests, and the production build.
2. Exercise representative browser and runtime paths in the sandbox.
3. Set the release version in `package.json`.
4. Build the Cloudflare installer artifacts and inspect the release manifest.
5. Update deployment documentation for new requirements or migrations.
6. Prepare the user-facing release notes.

Use Semantic Versioning while the product is pre-1.0:

- `0.0.x` for fixes and modest feature batches.
- `0.x.0` for a meaningful product milestone or breaking change.
- `1.0.0` when compatibility and operational guarantees are stable.

## Publishing

After the release PR is merged:

1. Confirm `main` is at the intended release commit.
2. Create the immutable Git tag `v<version>` from that commit.
3. Create a GitHub Release attached to that tag.
4. Review the title and Markdown description, then publish the release.
5. Wait for the Cloudflare installer release workflow to finish.
6. Verify that the Worker bundle, asset payload, and installer manifest are attached to the release and identify the expected version.

Publishing the GitHub Release triggers
`.github/workflows/publish-installer-release.yml`. It builds the Nuxt Worker,
packages the static assets and D1 migrations, and attaches the versioned
installer artifacts to the GitHub Release. The guided installer consumes the
pinned manifest rather than an unversioned branch.

Do not move an existing release tag or overwrite a broken version. Fix the
problem and publish the next patch release.

## Release notes

Release descriptions are a user-facing changelog, not a raw list of commits.
Include what changed, operational consequences, upgrade instructions, and
known limitations.

```md
## What's new

- Record and send audio messages.
- Play audio attachments directly inside conversations.

## Fixes

- Describe user-visible fixes.

## Deployment

Mention installer compatibility, new Cloudflare bindings or permissions,
migrations, and any manual actions required by GitHub/Workers Builds users.

## Known limitations

- Live huddles require RealtimeKit and internet connectivity.

**Full changelog:** v0.0.1...v0.0.2
```

## Hotfixes

For an urgent production fix:

1. If `main` contains only changes safe for the patch, branch from `main` and
   open a focused PR back to `main`.
2. If `main` contains unreleased changes that must not ship, branch from the
   latest release tag, publish the patch from that branch, and then apply the
   fix forward to `main` through a separate PR.
3. Publish the next immutable patch tag and GitHub Release.
