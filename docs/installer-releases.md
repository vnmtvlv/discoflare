# Discoflare installer releases

The private control plane at `discoflare.com/admin` consumes immutable workspace release artifacts from this repository and provisions selected Installations in connected Cloudflare accounts. The Cloudflare Deploy Button and standalone CLI remain source-level recovery paths.

## Publishing a release

Publishing a GitHub Release triggers `.github/workflows/publish-installer-release.yml`. The workflow:

1. Builds the workspace Nuxt Worker without deploying it.
2. Packages the Worker, static assets, and D1 migrations as release artifacts.
3. Publishes the versioned Agent Computer image to public GHCR.
4. Builds the shared installer-core and standalone CLI packages.
5. Attaches the workspace manifest, payloads, and packages to the GitHub Release.

Release tags may use either `v1.2.3` or `1.2.3`. The GitHub workflow publishes the matching public `ghcr.io/vnmtvlv/discoflare-computer:<version>` image before attaching the manifest.

The control plane discovers Installations by their `DISCOFLARE_INSTALLATION` marker and applies a selected update in place while reusing bound D1, R2, KV, Durable Object, Workflow, Container, domain, and mail resources. Installations do not contain a Cloudflare management token or Admin service binding.

The same provisioning engine lives in `packages/installer-core`. `packages/cli` bundles it into a standalone Node executable that reads release artifacts from GitHub and accepts an explicit `CLOUDFLARE_API_TOKEN`; it never calls `discoflare.com`. A release tarball can be run with `npx <GitHub Release URL to discoflare-cli-VERSION.tgz>`.

Before deploying an updated Worker, the installer reads `d1_migrations` from that bound D1 database and applies every missing release migration in filename order. Each migration and its migration marker execute in the same D1 batch. A failed or unrecorded migration stops the update. The installer does not create an automatic backup; the owner can first download one or manually upload one to a configured S3-compatible bucket from **Workspace Settings → Backups**.

The same temporary OAuth installer owns the managed uninstall flow at `discoflare.com/uninstall`. The workspace Owner starts it from **Workspace Settings → Danger Zone**, receives a short-lived one-use claim, may leave to create an optional backup, and must type the full workspace origin after the installer has matched the marked Worker. The live R2 bucket is emptied by the installed Worker before the installer deletes the managed Cloudflare resources. Manual installations are deliberately excluded from automatic resource deletion.

## Building locally

Run:

```sh
pnpm release:installer
```

Generated files are written to `.installer/release` and are excluded from Git.
