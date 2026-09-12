# Keep Cloudflare deployment authority in one account-local Worker

Discoflare Admin is a separate, deliberately small Worker. Cloudflare OAuth verifies the configured owner and Admin keeps a stateless encrypted session cookie, so it needs neither Cloudflare Access nor D1. It holds one broad credential, either the renewable Managed Setup OAuth credential or an operator-supplied account token connected directly on the Admin origin, while workspace Workers hold only narrow installation capabilities and continue running if Admin is unavailable.
