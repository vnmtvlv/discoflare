# discoflare.com

Marketing site for [Discoflare](https://github.com/vnmtvlv/discoflare), built with Nuxt 4 and Nuxt UI 4.

## Development

```bash
pnpm install
pnpm com:dev
```

## Verify and build

```bash
pnpm com:typecheck
pnpm com:test
pnpm com:build
```

The marketing routes are prerendered. `/deploy` is Managed Setup: public-client PKCE OAuth creates the account-local Admin Worker and stores its renewable credential there, then discards the website session. The completed handoff stays in the encrypted installer session so a refresh resumes the workspace redirect until its token expires.

## Deployment

Cloudflare Workers Builds deploys the site automatically when a commit is pushed to `main`:

- Root directory: repository root
- Build command: `pnpm com:build`
- Deploy command: `pnpm --filter @discoflare/com run deploy`
- Include paths: `apps/com/**`, `packages/installer-core/**`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`

Changes confined to the workspace Worker, Admin, or native client shells should not trigger a website deployment. Keep the Workers Builds include paths above aligned with the website's actual workspace dependencies.

The deploy command rejects local execution and non-production branches. Do not deploy `apps/com` from a developer machine. The Worker and `discoflare.com` custom domain are configured in [`wrangler.jsonc`](wrangler.jsonc).

Production requires the secrets from `.env.example`. The single public OAuth client ID is declared in `wrangler.jsonc` so a Workers Build cannot erase it; register its callback as `https://discoflare.com/api/cloudflare/oauth/callback`. Managed Setup stores the returned refresh credential in the new Admin Worker and deletes the website session. Later Admin login reuses the same client with identity and verification read scopes.

The public infrastructure counters use the `discoflare-com-telemetry` D1 database. Create it once with `pnpm db:create`, put the returned database ID into `wrangler.jsonc` if Wrangler does not resolve the name automatically, and configure `NUXT_TELEMETRY_HASH_SECRET` as a Worker secret. Production migrations run only inside the Workers Builds deploy command. Only a keyed hash of the Cloudflare account and Worker identity is retained; raw account IDs, Worker names, domains, owner details, and workspace content are not stored.

## Product demos

Demo sections use coded previews. See [`public/demos/README.md`](public/demos/README.md) for the video convention.

Brand assets are copied from the Discoflare product repository so this site can deploy independently.

## Documentation

Public operator documentation lives in `content/docs` and is rendered at `/docs` with Nuxt Content. Documentation routes are prerendered explicitly because the same Worker also serves the dynamic Cloudflare installer.

The docs site can be published from a private website repository. The alternative Cloudflare Deploy Button builds from the separate public Discoflare application repository and requires manual Cloudflare account setup.

## Crawler and agent discovery

`public/robots.txt` keeps the public site crawlable and points to `public/sitemap.xml`. `public/llms.txt` is the concise agent entry point and links to Markdown versions of the product, privacy, and terms pages. Keep those files aligned whenever the corresponding site content changes.

## License

The source code is available under the [MIT License](LICENSE). The Discoflare name, logos, artwork, screenshots, and marketing copy are not licensed for reuse by the MIT License.
