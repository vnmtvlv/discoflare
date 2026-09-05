# Release process

`main` represents released, production-ready Discoflare code. Development may
accumulate on a long-lived `dev` branch once that branch is introduced. Until
then, use short-lived feature and fix branches and keep `main` releasable.

## Branch flow

```text
feature/audio-messages ─┐
feature/another-change ─┼─> dev ─> release PR ─> main
fix/a-bug              ─┘                         │
                                                   └─> tag and GitHub Release
```

- Merge focused feature and fix branches into `dev` through small PRs.
- Keep `dev` green and deployable to the sandbox.
- Use a release PR from `dev` to `main` to review the complete release.
- The release PR should aggregate changes that were already reviewed; it should
  not be the first review of one large batch.
- Merge `main` back into `dev` after release-only commits or production
  hotfixes so the branches do not diverge.

## Preparing a release

The release PR must:

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

1. Branch from `main`.
2. Open a focused PR back to `main`.
3. Publish the next patch release.
4. Merge `main` back into `dev`.
