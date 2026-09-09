# Discoflare.com installer releases

The installer on `discoflare.com/deploy` deploys Discoflare directly into a user's Cloudflare account. It does not require the user to create a GitHub repository. The existing Cloudflare Deploy Button remains available as an alternative.

## Publishing a release

Publishing a GitHub Release triggers `.github/workflows/publish-installer-release.yml`. The workflow:

1. Builds the Nuxt Worker without deploying it.
2. Packages the Worker, static assets, and D1 migrations as release artifacts.
3. Publishes the versioned Agent Computer image to public GHCR.
4. Builds the shared installer-core and standalone CLI packages.
5. Attaches the installer manifest, payloads, and packages to the GitHub Release.

Release tags may use either `v1.2.3` or `1.2.3`. The GitHub workflow publishes the matching public `ghcr.io/vnmtvlv/discoflare-computer:<version>` image before attaching the manifest.

The installer follows the manifest URL configured on `discoflare.com`. Its default points to the latest GitHub Release, so existing installations can be updated by running the installer again. New installs carry a `DISCOFLARE_INSTALLATION` marker. Updates also recognize the full binding signature of older GitHub installs, while refusing to overwrite an unrelated Worker with the same name.

Owners can check **Workspace Settings → Updates**. The installed Worker reads the public stable GitHub Releases list and compares it with `DISCOFLARE_VERSION`. A Manual installation opens a release-pinned upgrade URL on `discoflare.com`; after fresh Cloudflare OAuth, the installer finds the marked Worker by its existing hostname and reuses the D1, R2, and KV resources already bound to it. A Managed installation downloads the same signed-by-hash release artifacts and updates itself with its account-owned Instance Admin Token after the Owner explicitly selects the release.

Manual and Managed describe management authority, not how the installation was originally deployed. New guided installations start in Manual mode. The Owner may connect one account-owned token for updates, RealtimeKit, and eligible Cloudflare email infrastructure from **Workspace Settings → Cloudflare** on the installed origin. Disconnecting removes it from the Worker, disables managed Huddles, preserves existing email routes, and reminds the operator to revoke the token in Cloudflare.

The same provisioning engine lives in `packages/installer-core`. `packages/cli` bundles it into a standalone Node executable that reads release artifacts from GitHub and accepts an explicit `CLOUDFLARE_API_TOKEN`; it never calls `discoflare.com`. A release tarball can be run with `npx <GitHub Release URL to discoflare-cli-VERSION.tgz>`.

Before deploying an updated Worker, the installer reads `d1_migrations` from that bound D1 database and applies every missing release migration in filename order. Each migration and its migration marker execute in the same D1 batch. A failed or unrecorded migration stops the update. The installer does not create an automatic backup; the owner can first download one or manually upload one to a configured S3-compatible bucket from **Workspace Settings → Backups**.

The same temporary OAuth installer owns the managed uninstall flow at `discoflare.com/uninstall`. The workspace Owner starts it from **Workspace Settings → Danger Zone**, receives a short-lived one-use claim, may leave to create an optional backup, and must type the full workspace origin after the installer has matched the marked Worker. The live R2 bucket is emptied by the installed Worker before the installer deletes the managed Cloudflare resources. Manual installations are deliberately excluded from automatic resource deletion.

## Building locally

Run:

```sh
pnpm release:installer
```

Generated files are written to `.installer/release` and are excluded from Git.
