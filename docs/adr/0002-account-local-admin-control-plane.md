# Keep deployment authority in one account-local Discoflare Admin

Discoflare has one guided operating model: each Cloudflare account contains one small Worker named `discoflare-admin`. The temporary OAuth flow on `discoflare.com` creates or repairs only this Worker and its Cloudflare Access policy. The operator then creates one Account Admin Token and submits it directly to that private Worker origin.

Discoflare Admin discovers every marked Installation in the account and owns creation, updates, repair, RealtimeKit provisioning, and eligible email infrastructure. The broad token never enters an Installation. Each workspace instead receives a service binding to Admin and a derived per-Installation capability accepted only by a fixed RealtimeKit operation allowlist. Workspace chat and data continue without Admin; infrastructure changes and new Huddle API calls require it.

Cloudflare token policies still use account and zone resource boundaries. A dedicated Cloudflare account therefore provides the strongest isolation; an existing paid account shares its authority boundary across the Installations that Admin manages. The source/CLI deployment path remains an operator escape hatch, not a second product management mode.
