# Discoflare.com installer releases

The installer on `discoflare.com/deploy` deploys Discoflare directly into a user's Cloudflare account. It does not require the user to create a GitHub repository. The existing Cloudflare Deploy Button remains available as an alternative.

## Publishing a release

Publishing a GitHub Release triggers `.github/workflows/publish-installer-release.yml`. The workflow:

1. Builds the Nuxt Worker without deploying it.
2. Packages the Worker, static assets, and D1 migrations as release artifacts.
3. References Cloudflare's pinned public Sandbox base image.
4. Attaches the installer manifest and payloads to the GitHub Release.

Release tags may use either `v1.2.3` or `1.2.3`. The installer does not need credentials for a separate container registry.

The installer follows the manifest URL configured on `discoflare.com`. Its default points to the latest GitHub Release, so existing installations can be updated by running the installer again. New installs carry a `DISCOFLARE_INSTALLATION` marker. Updates also recognize the full binding signature of older GitHub installs, while refusing to overwrite an unrelated Worker with the same name.

Owners can check **Workspace Settings → Updates**. The installed Worker reads the public stable GitHub Releases list, compares it with `DISCOFLARE_VERSION`, and opens a release-pinned upgrade URL on `discoflare.com`. After Cloudflare OAuth, the installer finds the marked Worker by its existing hostname and reuses the D1, R2, and KV resources already bound to it.

Before deploying an updated Worker, the installer reads `d1_migrations` from that bound D1 database and applies every missing release migration in filename order. Each migration and its migration marker execute in the same D1 batch. A failed or unrecorded migration stops the update. The installer does not create an automatic backup; the owner can first download one or manually upload one to a configured S3-compatible bucket from **Workspace Settings → Backups**.

The same temporary OAuth installer owns the managed uninstall flow at `discoflare.com/uninstall`. The workspace Owner starts it from **Workspace Settings → Danger Zone**, receives a short-lived one-use claim, may leave to create an optional backup, and must type the full workspace origin after the installer has matched the marked Worker. The live R2 bucket is emptied by the installed Worker before the installer deletes the managed Cloudflare resources. Manual installations are deliberately excluded from automatic resource deletion.

## Building locally

Run:

```sh
pnpm release:installer
```

Generated files are written to `.installer/release` and are excluded from Git.
