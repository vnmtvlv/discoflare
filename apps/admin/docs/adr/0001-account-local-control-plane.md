# Keep Cloudflare deployment authority in one account-local Worker

Discoflare Admin is a separate, deliberately small Worker protected by Cloudflare Access. It holds one Account Admin Token for the Cloudflare account, while workspace Workers hold only narrow installation capabilities and continue running if Admin is unavailable. The hosted discoflare.com flow uses temporary OAuth only to bootstrap or repair Admin, avoiding both central retained authority and a broad token in every workspace.
