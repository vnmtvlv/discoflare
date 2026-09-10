# Keep Cloudflare deployment authority in one account-local Worker

Discoflare Admin is a separate, deliberately small Worker. Cloudflare OAuth verifies the configured owner and Admin keeps a stateless encrypted session cookie, so it needs neither Cloudflare Access nor D1. It holds one Account Admin Token while workspace Workers hold only narrow installation capabilities and continue running if Admin is unavailable. Managed setup creates that token automatically and discards temporary OAuth; private setup uses temporary OAuth only to bootstrap or repair Admin.
