# Keep Cloudflare deployment authority in one account-local Worker

Discoflare Admin is a separate, deliberately small Worker protected by Cloudflare Access. It holds either a locally refreshed Managed OAuth Grant or a private Account Admin Token, while workspace Workers hold only narrow installation capabilities and continue running if Admin is unavailable. Managed setup transfers OAuth into Admin and discards the hosted copy; private setup uses temporary OAuth only to bootstrap or repair Admin.
