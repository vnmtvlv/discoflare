<script setup lang="ts">
const siteUrl = 'https://discoflare.com/trust'
const repoUrl = 'https://github.com/vnmtvlv/discoflare'
const title = 'Trust and security · Discoflare'
const description = 'What the guided installer can touch in your Cloudflare account, what leaves a deployment, and how to revoke all of it.'

const scopeGroups = [
  {
    purpose: 'Bootstrap Discoflare Admin',
    scopes: ['workers-scripts.read', 'workers-scripts.write'],
    reason: 'Create or repair the small account-local Admin Worker.',
  },
  {
    purpose: 'Choose the account',
    scopes: ['account-settings.read', 'memberships.read'],
    reason: 'List the Cloudflare accounts you can deploy into so you can pick one.',
  },
  {
    purpose: 'Protect Discoflare Admin',
    scopes: ['access.read', 'access.write', 'access-acct.read', 'access-acct.write'],
    reason: 'Create the one-time-PIN Access application that sits in front of Admin.',
  },
]

const telemetryFields = [
  { field: 'installation_id', meaning: 'A random identifier generated for the deployment. It is not derived from anything about you.' },
  { field: 'account_worker_hash', meaning: 'A keyed HMAC-SHA-256 of the Cloudflare account ID and Worker name, used to recognise an update of the same deployment. It cannot be reversed without a secret held only by this site.' },
  { field: 'token_hash', meaning: 'A SHA-256 hash of the heartbeat token, so a deployment can authenticate its own later heartbeats.' },
  { field: 'version', meaning: 'The Discoflare release that was deployed.' },
  { field: 'deployments', meaning: 'How many times this deployment has been installed or updated.' },
  { field: 'has_d1, has_r2, has_kv, has_custom_domain, has_email, has_agents, has_huddles', meaning: 'Booleans recording which Cloudflare resource types and optional features are configured. Never amounts, sizes, or usage.' },
  { field: 'first_seen_at, last_deployed_at, last_heartbeat_at', meaning: 'Timestamps.' },
]

const posture = [
  {
    item: 'SOC 2',
    status: 'Not applicable to your workspace',
    detail: 'Discoflare runs no service that holds workspace data, so there is no processing environment to audit on your behalf. This website runs on Cloudflare, which is independently SOC 2 Type II and ISO 27001 certified. The project itself has not been audited.',
  },
  {
    item: 'GDPR',
    status: 'You are the controller',
    detail: 'A workspace you deploy runs in your account under your control, so Discoflare is not a processor of its data and no data processing addendum is required for it. How this website handles information is covered by the privacy policy.',
  },
  {
    item: 'Data residency',
    status: 'Wherever your account runs',
    detail: 'Discoflare chooses no region. Your workspace lives in the Cloudflare account you deployed it into, under the settings you configure there.',
  },
  {
    item: 'HIPAA',
    status: 'No BAA offered',
    detail: 'The project signs no Business Associate Agreements. Whether a workspace you operate yourself may carry protected health information is an assessment between you and Cloudflare.',
  },
  {
    item: 'PCI DSS',
    status: 'Out of scope',
    detail: 'There is nothing to buy. Discoflare has no billing, no checkout, and no cardholder data anywhere in the project.',
  },
]

useSeoMeta({
  title,
  description,
  robots: 'index, follow',
  ogTitle: title,
  ogDescription: description,
  ogType: 'website',
  ogUrl: siteUrl,
  ogSiteName: 'Discoflare',
  ogImage: 'https://discoflare.com/og-image.png',
  twitterCard: 'summary_large_image',
  twitterTitle: title,
  twitterDescription: description,
  twitterImage: 'https://discoflare.com/og-image.png',
})

useHead({
  link: [
    { rel: 'canonical', href: siteUrl },
    { rel: 'alternate', type: 'text/markdown', href: 'https://discoflare.com/trust.md' },
  ],
})
</script>

<template>
  <LegalPage
    eyebrow="Trust"
    title="Trust and security"
    description="What the guided installer can touch in your Cloudflare account, what leaves a deployment, and how to revoke all of it."
    effective-date="September 6, 2026"
  >
    <section>
      <h2>The short version</h2>
      <p>Discoflare is MIT-licensed software that runs in your own Cloudflare account. There is no Discoflare server between you and your workspace, no vendor database holding your messages, and no subprocessor list for your workspace data—because there is no service processing it.</p>
      <p>That leaves four explicit boundaries: the temporary bootstrap on this website, Discoflare Admin in your own account, an anonymous deployment heartbeat, and the source you deploy.</p>
    </section>

    <section>
      <h2>What the installer asks for</h2>
      <p>Connecting Cloudflare grants an OAuth token scoped to the permissions below. The token is kept in an encrypted, HTTP-only session cookie in your browser, is never written to a Discoflare database, and the session expires after one hour. Disconnecting revokes it immediately; you can also revoke it yourself from your Cloudflare account at any time.</p>
      <p>The bootstrap uses its fixed OAuth scopes only to create or repair the <code>discoflare-admin</code> Worker and its Cloudflare Access policy. It does not deploy workspaces, create their storage, or request a permanent token.</p>
      <p>Managed Setup transfers a renewable OAuth grant directly into Discoflare Admin and discards the hosted copy. Private Setup lets the operator submit an Account Admin Token directly on the Admin <code>workers.dev</code> origin. Neither credential enters a workspace Worker. Admin uses it only for fixed installation, update, RealtimeKit, email, and repair operations in the selected account.</p>
      <div v-for="group in scopeGroups" :key="group.purpose" class="scope-group">
        <h3>{{ group.purpose }}</h3>
        <p>{{ group.reason }}</p>
        <p class="scope-list">
          <code v-for="scope in group.scopes" :key="scope">{{ scope }}</code>
        </p>
      </div>
      <p>The installer never asks for billing, audit log, account member management, or Zero Trust device permissions, and it cannot read Worker code or data in Cloudflare accounts you did not select.</p>
    </section>

    <section>
      <h2>What leaves a deployment</h2>
      <p>A guided installation records one row after it deploys, and sends an authenticated weekly heartbeat afterwards. That row is the complete set of what this project ever learns about a workspace:</p>
      <table>
        <thead>
          <tr>
            <th scope="col">Stored</th>
            <th scope="col">What it is</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in telemetryFields" :key="row.field">
            <td><code>{{ row.field }}</code></td>
            <td>{{ row.meaning }}</td>
          </tr>
        </tbody>
      </table>
      <p>The workspace owner can turn the heartbeat off in Settings → Telemetry. The public counters on this site are aggregates of these rows and cannot identify a deployment.</p>
    </section>

    <section>
      <h2>What never leaves</h2>
      <p>The Cloudflare account ID, the Worker name, the workspace hostname, the domain, and the owner's name and email are not stored. Neither are messages, mail, files, database records, tasks, member lists, Agent transcripts, or any measure of how much of anything a workspace holds.</p>
      <p>Owner name, email, and password are sent to Cloudflare as encrypted Worker secrets during a first installation and are not intentionally retained by this site afterwards.</p>
    </section>

    <section>
      <h2>Agent boundaries</h2>
      <p>Agents are workspace members, not sign-in identities. An Agent never receives a browser session or a human login, so a member's OAuth or social sign-in grants it no repository, shell, credential, or deployment access. It cannot enter a private Channel it has not joined, every Mail action requires an explicit mailbox grant, and risky conversational commands pause until an authorized member approves them.</p>
      <p>Each Agent owns a durable Computer whose filesystem lives in Durable Object SQLite. Linux commands run through an isolated Cloudflare Container backend; large artifacts belong in your R2 bucket. The complete boundary is documented in the <NuxtLink to="/docs/product-guide/agents">Agents guide</NuxtLink>.</p>
    </section>

    <section>
      <h2>Compliance posture</h2>
      <p>Self-hosting moves most compliance questions from this project to you and Cloudflare. Stated plainly:</p>
      <table>
        <thead>
          <tr>
            <th scope="col">Area</th>
            <th scope="col">Status</th>
            <th scope="col">Detail</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in posture" :key="row.item">
            <td>{{ row.item }}</td>
            <td>{{ row.status }}</td>
            <td>{{ row.detail }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section>
      <h2>Subprocessors</h2>
      <p>Your workspace has none by default. It runs on the Cloudflare account you own, and enabling voice huddles adds RealtimeKit, which you configure with your own credentials.</p>
      <p>This website uses Cloudflare for hosting and for the D1 database holding the deployment rows described above, and GitHub for source, releases, and the installer manifest it downloads. Nothing on this site is shared with advertising or analytics providers, because it uses neither.</p>
    </section>

    <section>
      <h2>Reporting a vulnerability</h2>
      <p>Report security issues privately through a <ULink :to="`${repoUrl}/security/advisories/new`" target="_blank">GitHub security advisory</ULink> on the Discoflare repository. Please include the affected version and enough detail to reproduce the issue. Do not open a public issue for a security report.</p>
    </section>

    <section>
      <h2>Related</h2>
      <p><NuxtLink to="/privacy">Privacy policy</NuxtLink> · <NuxtLink to="/terms">Terms of use</NuxtLink> · <NuxtLink to="/docs/installation/cloudflare">Installation guide</NuxtLink> · <NuxtLink to="/uninstall">Remove a deployment</NuxtLink></p>
    </section>
  </LegalPage>
</template>

<style scoped>
.scope-group {
  border-top: 1px solid var(--ui-border-muted);
  display: grid;
  gap: 0.5rem;
  padding-top: 1.25rem;
}

.scope-group h3 {
  color: var(--ui-text-highlighted);
  font-size: 1rem;
  font-weight: 600;
}

.scope-group p {
  color: var(--ui-text-muted);
  line-height: 1.75;
}

.scope-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.scope-list code {
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border-muted);
  border-radius: 0.375rem;
  color: var(--ui-text-toned);
  font-family: ui-monospace, monospace;
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
}
</style>
