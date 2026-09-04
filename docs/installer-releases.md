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

## Building locally

Run:

```sh
pnpm release:installer
```

Generated files are written to `.installer/release` and are excluded from Git.
