<script setup lang="ts">
import type { AccordionItem, NavigationMenuItem } from '@nuxt/ui'

const repoUrl = 'https://github.com/vnmtvlv/discoflare'
const creatorUrl = 'https://github.com/vnmtvlv'
const deployUrl = 'https://deploy.workers.cloudflare.com/?url=https://github.com/vnmtvlv/discoflare'
const installerUrl = '/deploy'
const sandboxUrl = 'https://sandbox.discoflare.com'
const siteUrl = 'https://discoflare.com/'
const websiteId = `${siteUrl}#website`
const organizationId = `${siteUrl}#organization`
const softwareId = `${siteUrl}#software`
const faqId = `${siteUrl}#faq`
const logoUrl = 'https://discoflare.com/brand/logo-256.png'
const socialImageUrl = 'https://discoflare.com/og-image.png'
const pageTitle = 'Discoflare — Chat, mail, databases, tasks, and agents. No seat fees.'
const pageDescription = 'Open-source, self-hosted workspace: chat, shared mailboxes, databases, tasks, and AI agents. Unlimited history, unlimited mailboxes, unlimited records, $0 in software fees—running in your own Cloudflare account.'

const navigation = computed<NavigationMenuItem[]>(() => [
  { label: 'Features', to: '#features' },
  { label: 'Compare', to: '#compare' },
  { label: 'Agents', to: '#agents' },
  { label: 'Deploy', to: '#deploy' },
  { label: 'Docs', to: '/docs' },
  { label: 'Trust', to: '/trust' },
  { label: 'Pricing', to: '#pricing' },
  { label: 'FAQ', to: '#faq' },
])

const sectionIds = ['features', 'compare', 'ownership', 'agents', 'models', 'deploy', 'pricing', 'faq'] as const
let scrollFrame: number | undefined

function syncHashToScroll() {
  const activeSection = sectionIds.findLast((sectionId) => {
    const section = document.getElementById(sectionId)
    return section ? section.getBoundingClientRect().top <= 96 : false
  })
  const nextHash = activeSection ? `#${activeSection}` : ''

  if (window.location.hash === nextHash) return

  window.history.replaceState(
    window.history.state,
    '',
    `${window.location.pathname}${window.location.search}${nextHash}`,
  )
}

function scheduleHashSync() {
  if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame)

  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = undefined
    syncHashToScroll()
  })
}

onMounted(() => {
  window.addEventListener('scroll', scheduleHashSync, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', scheduleHashSync)
  if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame)
})

const limits = [
  { value: 'Unlimited', label: 'message history', note: 'No 90-day cliff' },
  { value: 'Unlimited', label: 'mailboxes & addresses', note: 'On your own domain' },
  { value: 'Unlimited', label: 'databases & records', note: 'Typed fields included' },
  { value: '$0', label: 'per seat, forever', note: 'MIT licensed' },
]

const features = [
  {
    icon: 'i-ph-chats-circle',
    title: 'Chat that borrows from both',
    stack: 'D1 · Durable Objects',
    description: 'Slack-style channels and threads with Discord-style voice huddles. Every message you have ever sent stays searchable—nothing is hidden behind a retention upgrade.',
  },
  {
    icon: 'i-ph-envelope-simple',
    title: 'Mail on your domain',
    stack: 'Email Routing · Email Sending · R2',
    description: 'Shared mailboxes read as channels and email conversations as threads. Add as many addresses as your team needs without buying a seat for each one.',
  },
  {
    icon: 'i-ph-table',
    title: 'Databases, not another subscription',
    stack: 'D1',
    description: 'Build workspace databases with typed fields, inline editing, filtering, and sorting. Add records until your Cloudflare plan says stop—not until a plan tier does.',
  },
  {
    icon: 'i-ph-kanban',
    title: 'Tasks that actually run',
    stack: 'Workflows · Durable Objects',
    description: 'Boards with labels, dependencies, and checklists, where each run is a durable Cloudflare Workflow—resumable, cancellable, and recorded with its result.',
  },
  {
    icon: 'i-ph-robot',
    title: 'AI with no per-seat add-on',
    stack: 'Workers AI · Containers',
    description: 'Agents are workspace members running on Workers AI through your own binding. No vendor key, no assistant tier—you pay Cloudflare for the inference you use.',
  },
  {
    icon: 'i-ph-cloud',
    title: 'Your account, your data',
    stack: 'Workers · KV · R2',
    description: 'The Worker, database, files, and live connections run in Cloudflare infrastructure you own. Update in place, read the source, fork it under MIT.',
  },
]

const comparison = [
  {
    capability: 'Message history',
    elsewhere: 'Slack\u2019s free plan hides anything older than 90 days',
    here: 'Every message stays in your D1 database',
  },
  {
    capability: 'Team size',
    elsewhere: 'Slack, Notion, and Google Workspace bill per user, per month',
    here: 'Invite the whole company. The software bill does not move',
  },
  {
    capability: 'Mailboxes and addresses',
    elsewhere: 'Google Workspace charges a mailbox per person; alias counts are capped by plan',
    here: 'Shared mailboxes and addresses on your domain, granted per member',
  },
  {
    capability: 'Databases and records',
    elsewhere: 'Notion prices structured work per member and gates it behind tiers',
    here: 'Databases, custom fields, and records with no product-imposed ceiling',
  },
  {
    capability: 'AI',
    elsewhere: 'Slack AI and Notion AI are per-seat add-ons on top of the seat',
    here: 'Workers AI usage billed by Cloudflare. Nothing per seat',
  },
  {
    capability: 'Where the data lives',
    elsewhere: 'In the vendor\u2019s account, under the vendor\u2019s export rules',
    here: 'In your Cloudflare account, in resources you can back up and delete',
  },
  {
    capability: 'The source',
    elsewhere: 'Closed. Product direction is controlled by the vendor',
    here: 'MIT licensed. Read it, run it, change it',
  },
]

const platform = [
  { service: 'Workers', role: 'The workspace itself. One Worker serves the app, the API, and every live connection.' },
  { service: 'D1', role: 'Messages, mail conversations, records, tasks, members, and permissions.' },
  { service: 'R2', role: 'Attachments, raw email, and large Agent artifacts.' },
  { service: 'KV', role: 'Short-lived connection tickets.' },
  { service: 'Durable Objects', role: 'Live connection state and ordered realtime delivery.' },
  { service: 'Workflows', role: 'Task runs that survive interruption, cancellation, and retry.' },
  { service: 'Workers AI', role: 'Agent inference through the deployment\u2019s own binding.' },
  { service: 'Containers', role: 'Linux execution for each durable Agent Computer.' },
  { service: 'Email Routing and Sending', role: 'Inbound mail into shared mailboxes, and outbound replies.' },
]

const youOwn = [
  'The Cloudflare account and every resource the workspace runs on',
  'The Worker, the D1 database, the R2 buckets, and the KV namespace',
  'Every message, mailbox, record, task, and file in the workspace',
  'The domain and the workspace hostname',
  'The AI binding, and every token of inference billed to you',
  'The source, under the MIT license, forkable without permission',
]

const weOwn = [
  'The source code and tagged releases published on GitHub',
  'This website and its guided installer, which holds a Cloudflare OAuth token in your browser session for one hour and never in a database',
  'An anonymous deployment heartbeat the workspace owner can switch off',
]

const agentBoundaries = [
  {
    number: '01',
    title: 'No inherited identity',
    description: 'An Agent never receives a browser session or a human login. A member\u2019s OAuth or social sign-in gives an Agent no repository, shell, credential, or deployment access.',
  },
  {
    number: '02',
    title: 'Access is granted, never assumed',
    description: 'An Agent cannot enter a private Channel it has not joined, and every Mail action requires an explicit mailbox grant. Each Channel, Thread, and Task Run keeps its own isolated memory.',
  },
  {
    number: '03',
    title: 'Risky work stops for a human',
    description: 'Risky conversational commands pause until an authorized member approves or rejects them. Approving one command is not the same as accepting a whole Task result.',
  },
]

const models = [
  { id: '@cf/zai-org/glm-4.7-flash', input: '$0.06', output: '$0.40', note: 'Cheapest useful default' },
  { id: '@cf/openai/gpt-oss-20b', input: '$0.20', output: '$0.30', note: 'Balanced everyday agent' },
  { id: '@cf/meta/llama-4-scout-17b-16e-instruct', input: '$0.27', output: '$0.85', note: 'Reads image attachments' },
  { id: '@cf/openai/gpt-oss-120b', input: '$0.35', output: '$0.75', note: 'Stronger reasoning' },
  { id: '@cf/nvidia/nemotron-3-120b-a12b', input: '$0.50', output: '$1.50', note: 'Long, structured work' },
  { id: '@cf/deepseek-ai/deepseek-v4-pro-0813', input: '$1.32', output: '$3.96', note: 'Hardest tasks' },
  { id: '@cf/zai-org/glm-5.3', input: '$1.40', output: '$4.40', note: 'Frontier tier' },
]

const costRows = [
  { resource: 'Workers requests', included: '10 million per month', after: '$0.30 per additional million' },
  { resource: 'Worker CPU time', included: '30 million CPU-ms per month', after: '$0.02 per additional million' },
  { resource: 'D1 rows read', included: '25 billion per month', after: '$0.001 per million' },
  { resource: 'D1 rows written', included: '50 million per month', after: '$1.00 per million' },
  { resource: 'D1 storage', included: 'First 5 GB', after: '$0.75 per GB-month' },
  { resource: 'R2 storage', included: 'First 10 GB-month', after: '$0.015 per GB-month, egress always free' },
  { resource: 'KV reads', included: '10 million per month', after: '$0.50 per million' },
  { resource: 'Workflow steps', included: '500,000 per month', after: '$0.80 per additional 100,000' },
  { resource: 'Agent Computers', included: '25 GiB-hours memory and 375 vCPU-minutes per month', after: 'Container execution is billed per 10ms while running' },
  { resource: 'Agent inference', included: '10,000 neurons per day', after: '$0.011 per 1,000 neurons, or the per-model token rate' },
]

const deploySteps = [
  { number: '01', title: 'Install Admin', description: 'Temporary Cloudflare OAuth creates one small Worker and its account-owned token.' },
  { number: '02', title: 'Open your Admin', description: 'Sign in with Cloudflare; no Access application or Admin database is required.' },
  { number: '03', title: 'Create workspaces', description: 'Admin provisions each complete Discoflare Installation and its owner setup link.' },
  { number: '04', title: 'Operate everything', description: 'Admin discovers installations, enables Huddles, connects eligible email, and applies updates.' },
]

const faqItems: AccordionItem[] = [
  {
    label: 'What does \u201Cunlimited\u201D actually mean here?',
    content: 'It means Discoflare imposes no limit. There is no message retention window, no mailbox count, no record cap, and no seat meter in the software. The only ceiling is the Cloudflare plan you deploy onto and the storage you are willing to pay Cloudflare for.',
  },
  {
    label: 'So what does it cost?',
    content: 'The software is $0 and MIT licensed, with no Discoflare subscription of any kind. You pay Cloudflare directly for the Workers, D1, R2, KV, Workflows, Containers, and Workers AI usage your workspace generates, and RealtimeKit separately if you enable voice huddles.',
  },
  {
    label: 'What do I need to run it?',
    content: 'A Cloudflare account on the Workers Paid plan. A domain is needed only for a custom workspace address or workspace email. The guided installer provisions the Worker and its Cloudflare resources without GitHub. The alternative repository-based flow requires a GitHub account and manual resource, binding, secret, hostname, and migration setup.',
  },
  {
    label: 'Where is workspace data stored?',
    content: 'Messages, mail, databases, tasks, and members use D1. Agent Computer files live in Durable Object SQLite; attachments, raw email, and large artifacts use R2. Short-lived connection tickets use KV. All of it lives in the Cloudflare account used for deployment, not in an account we control.',
  },
  {
    label: 'How does mail work without a mail vendor?',
    content: 'Incoming email is routed to the Worker through Cloudflare Email Routing and becomes a conversation in a shared mailbox; replies go out through the Cloudflare email binding. Internal notes stay inside the workspace, and read, send, and manage access is granted per mailbox to humans or agents.',
  },
  {
    label: 'What runs the agents?',
    content: 'Agents use Workers AI through the deployment\u2019s own AI binding. Each Agent has a durable Computer backed by Durable Object SQLite and uses Cloudflare Containers for Linux execution, which is why the Workers Paid plan is required.',
  },
  {
    label: 'How are agent actions controlled?',
    content: 'In agent conversations, risky commands pause until an authorized member approves or rejects them. Agents are workspace members rather than sign-in identities, and configuring them requires workspace administration permission.',
  },
  {
    label: 'Can I try it before deploying?',
    content: 'Yes. The public sandbox is the official pilot workspace. Use it to get a feel for Discoflare before creating your own deployment.',
  },
  {
    label: 'How do I get updates?',
    content: 'Updates are applied in place against the same Cloudflare resources, so a workspace upgrades without migrating to a new deployment. Tagged releases in the repository are the source of what has shipped.',
  },
]

useSeoMeta({
  title: pageTitle,
  description: pageDescription,
  author: 'vnmtvlv',
  applicationName: 'Discoflare',
  robots: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
  ogTitle: pageTitle,
  ogDescription: pageDescription,
  ogType: 'website',
  ogUrl: siteUrl,
  ogSiteName: 'Discoflare',
  ogLocale: 'en_US',
  ogImage: socialImageUrl,
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageType: 'image/png',
  ogImageAlt: 'Discoflare — chat, mail, databases, tasks, and agents on your Cloudflare account',
  twitterCard: 'summary_large_image',
  twitterTitle: pageTitle,
  twitterDescription: pageDescription,
  twitterImage: socialImageUrl,
  twitterImageAlt: 'Discoflare — chat, mail, databases, tasks, and agents on your Cloudflare account',
})

useHead({
  link: [
    { rel: 'canonical', href: siteUrl },
    { rel: 'alternate', type: 'text/markdown', href: 'https://discoflare.com/index.md' },
  ],
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebSite',
          '@id': websiteId,
          url: siteUrl,
          name: 'Discoflare',
          description: pageDescription,
          publisher: { '@id': organizationId },
        },
        {
          '@type': 'Organization',
          '@id': organizationId,
          name: 'Discoflare',
          url: siteUrl,
          logo: {
            '@type': 'ImageObject',
            '@id': `${siteUrl}#logo`,
            url: logoUrl,
            contentUrl: logoUrl,
            width: 256,
            height: 256,
          },
        },
        {
          '@type': 'FAQPage',
          '@id': faqId,
          isPartOf: { '@id': websiteId },
          mainEntity: faqItems.map(item => ({
            '@type': 'Question',
            name: item.label,
            acceptedAnswer: { '@type': 'Answer', text: item.content },
          })),
        },
        {
          '@type': 'SoftwareApplication',
          '@id': softwareId,
          name: 'Discoflare',
          url: siteUrl,
          image: socialImageUrl,
          description: pageDescription,
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web',
          license: 'https://opensource.org/license/mit',
          isPartOf: { '@id': websiteId },
          publisher: { '@id': organizationId },
          sameAs: repoUrl,
          author: {
            '@type': 'Person',
            name: 'vnmtvlv',
            url: creatorUrl,
          },
          offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'USD',
            category: 'free',
            availability: 'https://schema.org/InStock',
          },
          featureList: [
            'Real-time chat with channels, threads, and unlimited message history',
            'Shared domain mailboxes with per-mailbox access grants',
            'Workspace databases with typed custom fields and inline record editing',
            'Task boards with durable Cloudflare Workflow runs',
            'AI agents as workspace members running on Workers AI',
            'Optional voice huddles through RealtimeKit',
            'Self-hosted in the owner’s Cloudflare account under the MIT license',
          ],
        },
      ],
    }),
  }],
})
</script>

<template>
  <div class="min-h-screen overflow-x-clip bg-default text-default">
    <UHeader to="/" title="Discoflare" class="border-b border-muted/70 bg-default/80 backdrop-blur-xl">
      <template #title>
        <BrandLogo :linked="false" />
      </template>

      <UNavigationMenu :items="navigation" class="hidden lg:flex" />

      <template #right>
        <UColorModeButton color="neutral" variant="ghost" />
        <UButton :to="sandboxUrl" target="_blank" label="Try sandbox" color="neutral" variant="outline" />
      </template>

      <template #body>
        <UNavigationMenu :items="navigation" orientation="vertical" class="-mx-2.5" />
      </template>
    </UHeader>

    <main>
      <section class="relative border-b border-muted py-20 sm:py-28 lg:py-32">
        <div class="noise-grid pointer-events-none absolute inset-0 -z-10" />
        <div class="orange-glow pointer-events-none absolute left-1/2 top-0 -z-10 h-96 w-3/4 -translate-x-1/2 blur-3xl" />
        <UContainer>
          <div class="mx-auto max-w-4xl text-center">
            <UBadge color="neutral" variant="outline" class="mb-7" icon="i-ph-code">
              Open source · MIT licensed · $0 per seat
            </UBadge>
            <h1 class="display-title text-5xl font-semibold leading-[1.02] text-highlighted sm:text-7xl lg:text-8xl">
              One workspace for humans and agents.
            </h1>
            <p class="mx-auto mt-7 max-w-2xl text-lg leading-8 text-muted sm:text-xl">
              Chat, mail, databases, tasks, and AI agents—self-hosted in your own Cloudflare account. No seats, no retention window, no assistant tier.
            </p>
            <div class="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <UButton
                :to="installerUrl"
                label="Deploy to Cloudflare"
                trailing-icon="i-ph-arrow-right"
                size="xl"
              />
              <UButton
                :to="sandboxUrl"
                target="_blank"
                label="Open the sandbox"
                icon="i-ph-play-circle"
                color="neutral"
                variant="outline"
                size="xl"
              />
            </div>
            <p class="mt-4 text-xs text-dimmed">The software is free. Cloudflare usage is billed by Cloudflare.</p>
          </div>

          <dl class="mx-auto mt-14 grid max-w-4xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-muted bg-muted lg:grid-cols-4">
            <div v-for="limit in limits" :key="limit.label" class="bg-default px-5 py-6 text-center">
              <dt class="display-title text-2xl font-semibold text-highlighted sm:text-3xl">{{ limit.value }}</dt>
              <dd class="mt-1.5 text-sm text-toned">{{ limit.label }}</dd>
              <dd class="mt-1 text-xs text-dimmed">{{ limit.note }}</dd>
            </div>
          </dl>

        </UContainer>
      </section>

      <CommunityStats />

      <section id="features" class="scroll-mt-16 border-b border-muted py-20 sm:py-28">
        <UContainer>
          <div class="max-w-3xl">
            <p class="mb-3 text-sm font-medium text-primary">Five products, one deployment</p>
            <h2 class="display-title text-4xl font-semibold text-highlighted sm:text-5xl">Everything your team pays four vendors for.</h2>
            <p class="mt-5 max-w-2xl text-base leading-7 text-muted sm:text-lg">
              Chat, mail, databases, tasks, and agents share one membership, one permission model, and one database. Nothing is a separate SKU, because there are no SKUs.
            </p>
          </div>
          <div class="mt-12 grid gap-px overflow-hidden rounded-2xl border border-muted bg-muted sm:grid-cols-2 lg:grid-cols-3">
            <article v-for="feature in features" :key="feature.title" class="bg-default p-7 sm:p-8">
              <UIcon :name="feature.icon" class="size-6 text-primary" />
              <h3 class="mt-6 font-semibold text-highlighted">{{ feature.title }}</h3>
              <p class="mt-2 text-sm leading-6 text-muted">{{ feature.description }}</p>
              <p class="mt-5 font-mono text-xs uppercase tracking-wide text-dimmed">{{ feature.stack }}</p>
            </article>
          </div>

          <div class="mt-10 overflow-hidden rounded-2xl border border-muted">
            <div class="border-b border-muted bg-elevated px-6 py-5">
              <p class="text-xs font-medium uppercase tracking-wide text-dimmed">What runs it</p>
              <p class="mt-1.5 max-w-2xl text-sm leading-6 text-muted">Nine Cloudflare services, declared by the project and provisioned in the account you choose. There is no origin server, no vendor database, and nothing else in the path.</p>
            </div>
            <dl class="grid gap-px bg-muted sm:grid-cols-2 lg:grid-cols-3">
              <div v-for="item in platform" :key="item.service" class="bg-default px-6 py-5">
                <dt class="font-mono text-xs uppercase tracking-wide text-primary">{{ item.service }}</dt>
                <dd class="mt-2 text-sm leading-6 text-muted">{{ item.role }}</dd>
              </div>
            </dl>
          </div>
        </UContainer>
      </section>

      <section id="compare" class="scroll-mt-16 border-b border-muted py-20 sm:py-28">
        <UContainer>
          <div class="max-w-3xl">
            <p class="mb-3 text-sm font-medium text-primary">Compare</p>
            <h2 class="display-title text-4xl font-semibold text-highlighted sm:text-5xl">What you stop paying for.</h2>
            <p class="mt-5 max-w-2xl text-base leading-7 text-muted sm:text-lg">
              The usual stack meters people, history, and features separately. Discoflare meters none of them, because the deployment is yours.
            </p>
          </div>

          <div class="mt-12 overflow-hidden rounded-2xl border border-muted">
            <div class="hidden grid-cols-[0.8fr_1.2fr_1.2fr] gap-6 border-b border-muted bg-elevated px-7 py-4 text-xs font-medium uppercase tracking-wide text-dimmed lg:grid">
              <span>Capability</span>
              <span>The usual stack</span>
              <span class="text-primary">Discoflare</span>
            </div>
            <div
              v-for="row in comparison"
              :key="row.capability"
              class="grid gap-3 border-b border-muted px-7 py-6 last:border-b-0 lg:grid-cols-[0.8fr_1.2fr_1.2fr] lg:gap-6 lg:py-5"
            >
              <p class="font-medium text-highlighted">{{ row.capability }}</p>
              <p class="flex items-start gap-2.5 text-sm leading-6 text-muted">
                <UIcon name="i-ph-x-circle" class="mt-0.5 size-4 shrink-0 text-dimmed" />
                {{ row.elsewhere }}
              </p>
              <p class="flex items-start gap-2.5 text-sm leading-6 text-toned">
                <UIcon name="i-ph-check-circle" class="mt-0.5 size-4 shrink-0 text-primary" />
                {{ row.here }}
              </p>
            </div>
          </div>

          <p class="mt-5 max-w-3xl text-xs leading-5 text-dimmed">
            Comparisons describe how these products are packaged and billed, not their quality. Unlimited means Discoflare sets no limit—your Cloudflare plan and storage spend are the ceiling.
          </p>
        </UContainer>
      </section>

      <section id="ownership" class="scroll-mt-16 border-b border-muted py-20 sm:py-28">
        <UContainer>
          <div class="max-w-3xl">
            <p class="mb-3 text-sm font-medium text-primary">Ownership</p>
            <h2 class="display-title text-4xl font-semibold text-highlighted sm:text-5xl">Nothing of yours runs on our side.</h2>
            <p class="mt-5 max-w-2xl text-base leading-7 text-muted sm:text-lg">
              Plenty of tools promise “your data, your rules” and still keep a vendor control plane in the path. Discoflare Admin runs inside your own Cloudflare account. Discoflare.com may go offline without interrupting workspace chat or data.
            </p>
          </div>

          <div class="mt-12 grid gap-px overflow-hidden rounded-2xl border border-muted bg-muted lg:grid-cols-2">
            <div class="bg-default p-7 sm:p-9">
              <p class="text-xs font-medium uppercase tracking-wide text-primary">You own</p>
              <ul class="mt-6 space-y-3.5 text-sm leading-6 text-toned">
                <li v-for="item in youOwn" :key="item" class="flex items-start gap-2.5">
                  <UIcon name="i-ph-check-circle" class="mt-0.5 size-4 shrink-0 text-primary" />
                  {{ item }}
                </li>
              </ul>
            </div>
            <div class="bg-default p-7 sm:p-9">
              <p class="text-xs font-medium uppercase tracking-wide text-dimmed">Discoflare owns</p>
              <ul class="mt-6 space-y-3.5 text-sm leading-6 text-muted">
                <li v-for="item in weOwn" :key="item" class="flex items-start gap-2.5">
                  <UIcon name="i-ph-dot-outline" class="mt-0.5 size-4 shrink-0 text-dimmed" />
                  {{ item }}
                </li>
              </ul>
              <p class="mt-7 border-t border-muted pt-6 text-sm leading-6 text-dimmed">
                None of these sit between you and a deployed workspace. The account-local Admin is optional for repository operators, and the source deploys the same workspace software without discoflare.com. The authority boundaries and heartbeat are itemised on the <NuxtLink to="/trust" class="text-primary hover:underline">trust page</NuxtLink>.
              </p>
            </div>
          </div>
        </UContainer>
      </section>

      <section class="border-b border-muted">
        <UContainer>
          <DemoPanel
            eyebrow="Chat"
            title="Every message you ever sent is still here."
            description="Public and private channels, threads, reactions, mentions, presence, pins, and files. History has no expiry date, because the database is yours and nobody upsells you your own archive."
            icon="i-ph-chats-circle"
          >
            <ChannelDemo />
          </DemoPanel>

          <div class="border-t border-muted" />

          <DemoPanel
            eyebrow="Mail"
            title="Mailboxes without a per-person mailbox bill."
            description="Point your domain at the workspace and email becomes conversation. A mailbox reads as a channel, a conversation as a thread, and internal notes never leave the building. Add the addresses your team needs—support, billing, hello—without adding seats."
            icon="i-ph-envelope-simple"
            reverse
          >
            <MailDemo />
          </DemoPanel>

          <div class="border-t border-muted" />

          <DemoPanel
            eyebrow="Databases"
            title="Structured work, with the record cap removed."
            description="Build databases with typed custom fields, edit records inline, filter and sort them, and gate schema changes by permission. They live in the same D1 database as everything else, so there is no tier to upgrade when the table grows."
            icon="i-ph-table"
          >
            <DataDemo />
          </DemoPanel>

          <div class="border-t border-muted" />

          <div id="agents" class="scroll-mt-16">
            <DemoPanel
              eyebrow="Agents"
              title="Agents are members, not integrations."
              description="Mention an agent in a channel or send it a direct message, and it answers in place. Each channel and thread keeps its own memory. They run on Workers AI through your own binding—no vendor key, no per-seat assistant tier, just the inference you actually use."
              icon="i-ph-robot"
              reverse
            >
              <AgentDemo />
            </DemoPanel>
          </div>

          <div class="border-t border-muted" />

          <DemoPanel
            eyebrow="Tasks"
            title="Hand off work that outlives the message."
            description="Boards with labels, dependencies, and checklists, where assigning an agent is not the same as starting it. Every run executes as a durable Cloudflare Workflow—resumable after interruption, cancellable while running, and recorded with its configuration, progress, and result."
            icon="i-ph-list-checks"
          >
            <TaskDemo />
          </DemoPanel>

        </UContainer>
      </section>

      <section id="models" class="scroll-mt-16 border-b border-muted py-20 sm:py-28">
        <UContainer>
          <div class="max-w-3xl">
            <p class="mb-3 text-sm font-medium text-primary">Models</p>
            <h2 class="display-title text-4xl font-semibold text-highlighted sm:text-5xl">Pick the model. Pay Cloudflare for it.</h2>
            <p class="mt-5 max-w-2xl text-base leading-7 text-muted sm:text-lg">
              An Agent profile stores a Workers AI model ID, not a vendor key, so the workspace never depends on an outside AI account. Switch per Agent. Below is the range available on the deployment's own binding—from a model that costs cents per million tokens to a frontier one.
            </p>
          </div>

          <div class="mt-12 overflow-x-auto rounded-2xl border border-muted">
            <table class="w-full min-w-xl border-collapse text-left text-sm">
              <thead>
                <tr class="border-b border-muted bg-elevated text-xs font-medium uppercase tracking-wide text-dimmed">
                  <th scope="col" class="px-6 py-4 font-medium">Model</th>
                  <th scope="col" class="px-6 py-4 font-medium">Input / M tokens</th>
                  <th scope="col" class="px-6 py-4 font-medium">Output / M tokens</th>
                  <th scope="col" class="hidden px-6 py-4 font-medium sm:table-cell">Good for</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="model in models" :key="model.id" class="border-b border-muted last:border-b-0">
                  <td class="px-6 py-4 font-mono text-xs text-highlighted">{{ model.id }}</td>
                  <td class="px-6 py-4 text-toned">{{ model.input }}</td>
                  <td class="px-6 py-4 text-toned">{{ model.output }}</td>
                  <td class="hidden px-6 py-4 text-muted sm:table-cell">{{ model.note }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="mt-5 max-w-3xl text-xs leading-5 text-dimmed">
            Cloudflare's published Workers AI rates, September 2026. The full catalogue and current prices are on <ULink to="https://developers.cloudflare.com/workers-ai/platform/pricing/" target="_blank" class="text-primary hover:underline">Cloudflare's pricing page</ULink>; your deployment's picker shows every model its binding supports.
          </p>
        </UContainer>
      </section>

      <section class="border-b border-muted py-20 sm:py-28">
        <UContainer>
          <div class="max-w-3xl">
            <p class="mb-3 text-sm font-medium text-primary">Agent boundaries</p>
            <h2 class="display-title text-4xl font-semibold text-highlighted sm:text-5xl">An Agent starts with access to nothing.</h2>
            <p class="mt-5 max-w-2xl text-base leading-7 text-muted sm:text-lg">
              Agents are workspace members, and membership is the whole of their authority. Each one also gets a durable Computer: files live in its Durable Object, while Linux commands run through an isolated Container backend.
            </p>
          </div>

          <div class="mt-12 grid gap-px overflow-hidden rounded-2xl border border-muted bg-muted lg:grid-cols-3">
            <article v-for="boundary in agentBoundaries" :key="boundary.number" class="bg-default p-7 sm:p-8">
              <span class="font-mono text-sm text-primary">{{ boundary.number }}</span>
              <h3 class="mt-5 font-semibold text-highlighted">{{ boundary.title }}</h3>
              <p class="mt-2 text-sm leading-6 text-muted">{{ boundary.description }}</p>
            </article>
          </div>

          <p class="mt-6 text-sm leading-6 text-muted">
            The full boundary, including what an Agent still cannot reach, is in the <NuxtLink to="/docs/product-guide/agents" class="text-primary hover:underline">Agents guide</NuxtLink>.
          </p>
        </UContainer>
      </section>

      <section id="deploy" class="scroll-mt-16 border-b border-muted py-20 sm:py-28">
        <UContainer>
          <div class="grid items-start gap-14 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
            <div>
              <p class="mb-3 text-sm font-medium text-primary">Cloudflare deployment</p>
                <h2 class="display-title text-4xl font-semibold text-highlighted sm:text-5xl">Your workspace. Your account.</h2>
              <p class="mt-5 max-w-xl text-base leading-7 text-muted sm:text-lg">
                Chat, mail, databases, tasks, and agents deploy as one Nuxt Worker connected to the Cloudflare services declared by the project. Updates apply in place against the same resources.
              </p>
              <div class="mt-8 flex flex-col gap-3 sm:flex-row">
                <UButton :to="installerUrl" label="Deploy with Discoflare" trailing-icon="i-ph-arrow-right" size="lg" />
                <UButton :to="deployUrl" target="_blank" label="Deploy with GitHub" trailing-icon="i-ph-arrow-up-right" color="neutral" variant="outline" size="lg" />
              </div>
              <p class="mt-3 max-w-xl text-sm leading-6 text-muted">The GitHub method connects source to Workers Builds. You configure and verify every account-specific Cloudflare resource, binding, secret, hostname, and migration manually.</p>
            </div>

            <div>
              <div class="mb-8 min-h-44 overflow-hidden rounded-2xl border border-default bg-elevated p-6 shadow-xl sm:aspect-video sm:min-h-0 sm:p-8">
                <DeployDemo />
              </div>
              <ol class="space-y-6">
                <li v-for="step in deploySteps" :key="step.number" class="flex gap-5">
                  <span class="font-mono text-sm text-primary">{{ step.number }}</span>
                  <div>
                    <h3 class="font-medium text-highlighted">{{ step.title }}</h3>
                    <p class="mt-1 text-sm leading-6 text-muted">{{ step.description }}</p>
                  </div>
                </li>
              </ol>
            </div>
          </div>
        </UContainer>
      </section>

      <section id="pricing" class="scroll-mt-16 border-b border-muted py-20 sm:py-28">
        <UContainer>
          <div class="mx-auto max-w-3xl text-center">
            <p class="mb-3 text-sm font-medium text-primary">Pricing</p>
            <h2 class="display-title text-4xl font-semibold text-highlighted sm:text-5xl">There is no price list.</h2>
            <p class="mx-auto mt-5 max-w-2xl text-base leading-7 text-muted sm:text-lg">
              No seats, no tiers, no upgrade prompt when the archive grows or a tenth teammate joins. Discoflare is free and open source, and you pay Cloudflare directly for the infrastructure your workspace uses.
            </p>
          </div>

          <UCard class="mx-auto mt-12 max-w-2xl" :ui="{ body: 'p-7 sm:p-10' }">
            <div class="flex flex-col justify-between gap-8 sm:flex-row sm:items-end">
              <div>
                <p class="font-medium text-highlighted">Self-hosted</p>
                <div class="mt-4 flex items-baseline gap-2">
                  <span class="text-5xl font-semibold tracking-tight text-highlighted">$0</span>
                  <span class="text-muted">/ seat / month / forever</span>
                </div>
                <ul class="mt-7 space-y-3 text-sm text-toned">
                  <li v-for="item in ['MIT licensed, no Discoflare subscription', 'Chat, mail, databases, tasks, and agents included', 'Unlimited members, history, mailboxes, and records', 'In-place updates on the same Cloudflare resources', 'You pay Cloudflare for usage, and only Cloudflare']" :key="item" class="flex items-start gap-2">
                    <UIcon name="i-ph-check-circle" class="mt-0.5 size-4 shrink-0 text-primary" />
                    {{ item }}
                  </li>
                </ul>
              </div>
              <UButton :to="repoUrl" target="_blank" label="View source" icon="i-ph-github-logo" color="neutral" variant="outline" size="lg" />
            </div>
          </UCard>

          <div class="mx-auto mt-16 max-w-4xl">
            <div class="text-center">
              <h3 class="display-title text-2xl font-semibold text-highlighted sm:text-3xl">So what does Cloudflare bill?</h3>
              <p class="mx-auto mt-4 max-w-2xl text-sm leading-6 text-muted sm:text-base">
                One recurring number: the $5 per month Workers Paid minimum, which Agent Computers require for Container execution. Everything else has an included allowance first, and a published rate after it.
              </p>
            </div>

            <div class="mt-8 overflow-x-auto rounded-2xl border border-muted">
              <table class="w-full min-w-xl border-collapse text-left text-sm">
                <thead>
                  <tr class="border-b border-muted bg-elevated text-xs font-medium uppercase tracking-wide text-dimmed">
                    <th scope="col" class="px-6 py-4 font-medium">Resource</th>
                    <th scope="col" class="px-6 py-4 font-medium">Included</th>
                    <th scope="col" class="px-6 py-4 font-medium">Rate after that</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in costRows" :key="row.resource" class="border-b border-muted last:border-b-0">
                    <td class="px-6 py-4 font-medium text-highlighted">{{ row.resource }}</td>
                    <td class="px-6 py-4 text-toned">{{ row.included }}</td>
                    <td class="px-6 py-4 text-muted">{{ row.after }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p class="mt-5 text-xs leading-5 text-dimmed">
              Cloudflare's published rates, September 2026—confirm current pricing on <ULink to="https://developers.cloudflare.com/workers/platform/pricing/" target="_blank" class="text-primary hover:underline">Cloudflare's pricing pages</ULink>. A workspace of a few dozen people usually stays inside most of these allowances; the two lines that actually move with a team are Agent inference and file storage. Voice huddles are billed separately through RealtimeKit.
            </p>
          </div>
        </UContainer>
      </section>

      <section id="faq" class="scroll-mt-16 border-b border-muted py-20 sm:py-28">
        <UContainer>
          <div class="grid gap-12 lg:grid-cols-[0.7fr_1.3fr] lg:gap-20">
            <div>
              <p class="mb-3 text-sm font-medium text-primary">FAQ</p>
              <h2 class="display-title text-4xl font-semibold text-highlighted sm:text-5xl">Before you deploy.</h2>
            </div>
            <UAccordion :items="faqItems" type="multiple" :ui="{ item: 'border-b border-muted', label: 'text-base' }" />
          </div>
        </UContainer>
      </section>

      <section class="py-20 sm:py-28">
        <UContainer>
          <div class="relative overflow-hidden rounded-3xl border border-primary/20 bg-primary/6 px-6 py-16 text-center sm:px-12 sm:py-20">
            <div class="orange-glow pointer-events-none absolute inset-0 -z-10" />
            <img src="/brand/logo-128.png" alt="" class="mx-auto size-16" width="64" height="64">
            <h2 class="display-title mx-auto mt-6 max-w-2xl text-4xl font-semibold text-highlighted sm:text-5xl">Stop renting your workspace.</h2>
            <div class="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <UButton :to="installerUrl" label="Deploy Discoflare" trailing-icon="i-ph-arrow-right" size="xl" />
              <UButton :to="repoUrl" target="_blank" label="Star on GitHub" icon="i-ph-star" color="neutral" variant="outline" size="xl" />
            </div>
          </div>
        </UContainer>
      </section>
    </main>

    <UFooter class="border-t border-muted">
      <template #left>
        <BrandLogo />
      </template>
      <nav aria-label="Legal" class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted">
        <NuxtLink to="/docs" class="transition-colors hover:text-highlighted">Docs</NuxtLink>
        <NuxtLink to="/trust" class="transition-colors hover:text-highlighted">Trust</NuxtLink>
        <NuxtLink to="/privacy" class="transition-colors hover:text-highlighted">Privacy</NuxtLink>
        <NuxtLink to="/terms" class="transition-colors hover:text-highlighted">Terms</NuxtLink>
      </nav>
      <template #right>
        <UButton :to="repoUrl" target="_blank" aria-label="Discoflare on GitHub" icon="i-ph-github-logo" color="neutral" variant="ghost" />
      </template>
    </UFooter>
  </div>
</template>
