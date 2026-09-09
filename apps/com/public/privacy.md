# Discoflare privacy policy

Effective September 5, 2026.

## Scope

This policy covers discoflare.com, including its Cloudflare installer. A Discoflare workspace that someone deploys, the public sandbox, Cloudflare, and GitHub operate separately and may have their own privacy practices.

## Information handled by this site

The site does not offer Discoflare accounts, advertising, or behavioural analytics. A visitor's browser may save a local light or dark theme preference.

The infrastructure serving the site may process basic request data such as IP address, browser type, requested URL, and time of access for security, reliability, and delivery.

## Cloudflare installer

When a visitor connects Cloudflare, discoflare.com temporarily keeps the OAuth access token in an encrypted, HTTP-only session cookie. The installer uses it to list accessible accounts and create or update the requested Cloudflare resources. The token is not stored in a Discoflare database, and the session expires after one hour.

Owner name, email, and password are sent to Cloudflare as encrypted Worker secrets during a first installation. Discoflare.com does not intentionally retain those values after the deployment request. Disconnecting revokes the OAuth token and clears the installer session.

After a successful guided install or update, the site records a random installation ID, an irreversibly keyed account-and-Worker identifier, release version, timestamps, and aggregate Cloudflare resource types. It does not store the Cloudflare account ID, Worker name, configured domain, owner email, or workspace content.

## Anonymous heartbeat

Guided installations send an authenticated weekly heartbeat containing the random installation ID, Discoflare version, time, and booleans indicating whether supported Cloudflare resource types and optional features are configured. Workspace names, domains, people, messages, files, and usage amounts are never included.

The workspace owner can disable the heartbeat at any time in Settings → Telemetry. Public figures on discoflare.com are aggregate counts and do not identify an installation.

## External services

Links to GitHub, Cloudflare, and the Discoflare sandbox lead to services outside this site. Those services handle information under their own terms and privacy policies.

## Self-hosted workspaces

Discoflare is self-hosted software. The person or organization that deploys a workspace controls its configuration and data. Questions about a particular workspace should go to that workspace operator.

## Changes and contact

Material policy updates will be published at [the canonical privacy page](https://discoflare.com/privacy) with a new effective date. Contact the project maintainer through [GitHub](https://github.com/vnmtvlv).
