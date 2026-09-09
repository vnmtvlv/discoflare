# Discoflare.com installer releases

The installer on `discoflare.com/deploy` creates or repairs only `discoflare-admin`. That account-local Worker consumes the separately versioned Discoflare workspace releases and manages every guided Installation in the account. The Cloudflare Deploy Button remains a source-level escape hatch.

## Publishing a release

Publishing a GitHub Release triggers `.github/workflows/publish-installer-release.yml`. The workflow:

1. Builds the Nuxt Worker without deploying it.
2. Packages the Worker, static assets, and D1 migrations as release artifacts.
3. Publishes the versioned Agent Computer image to public GHCR.
4. Builds the shared installer-core and standalone CLI packages.
5. Attaches the installer manifest, payloads, and packages to the GitHub Release.

Release tags may use either `v1.2.3` or `1.2.3`. The GitHub workflow publishes the matching public `ghcr.io/vnmtvlv/discoflare-computer:<version>` image before attaching the manifest.

Discoflare Admin has its own repository, version, GitHub Release, Worker bundle, static asset payload, and integrity manifest. The bootstrap installer follows that Admin manifest. Admin separately follows the latest workspace manifest, reports outdated Installations in its inventory, and applies a selected update in place while reusing the bound D1, R2, KV, Durable Object, Workflow, Container, domain, Access, and mail resources.

Owners can check **Workspace Settings → Updates**, but infrastructure changes open Discoflare Admin. New installs carry a `DISCOFLARE_INSTALLATION` marker and `DISCOFLARE_MANAGEMENT_MODE=admin`. Adoption recognizes older marked installs, removes any legacy broad token or deployment-level RealtimeKit token, and adds the Admin service binding plus narrow capability. Admin refuses to overwrite unrelated Workers.

The same provisioning engine lives in `packages/installer-core`. `packages/cli` bundles it into a standalone Node executable that reads release artifacts from GitHub and accepts an explicit `CLOUDFLARE_API_TOKEN`; it never calls `discoflare.com`. A release tarball can be run with `npx <GitHub Release URL to discoflare-cli-VERSION.tgz>`.

Before deploying an updated Worker, the installer reads `d1_migrations` from that bound D1 database and applies every missing release migration in filename order. Each migration and its migration marker execute in the same D1 batch. A failed or unrecorded migration stops the update. The installer does not create an automatic backup; the owner can first download one or manually upload one to a configured S3-compatible bucket from **Workspace Settings → Backups**.

The same temporary OAuth installer owns the managed uninstall flow at `discoflare.com/uninstall`. The workspace Owner starts it from **Workspace Settings → Danger Zone**, receives a short-lived one-use claim, may leave to create an optional backup, and must type the full workspace origin after the installer has matched the marked Worker. The live R2 bucket is emptied by the installed Worker before the installer deletes the managed Cloudflare resources. Manual installations are deliberately excluded from automatic resource deletion.

## Building locally

Run:

```sh
pnpm release:installer
```

Generated files are written to `.installer/release` and are excluded from Git.
