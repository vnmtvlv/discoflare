<script setup lang="ts">
const siteUrl = 'https://discoflare.com/privacy'
const title = 'Privacy policy · Discoflare'
const description = 'How discoflare.com and its Cloudflare installer handle information.'

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
    { rel: 'alternate', type: 'text/markdown', href: 'https://discoflare.com/privacy.md' },
  ],
})
</script>

<template>
  <LegalPage
    title="Privacy policy"
    description="How discoflare.com and its Cloudflare installer handle information."
    effective-date="September 10, 2026"
  >
    <section>
      <h2>What this policy covers</h2>
      <p>This policy covers discoflare.com, including its Cloudflare installer. A Discoflare workspace that you deploy, the public sandbox, Cloudflare, and GitHub operate separately and may have their own privacy practices.</p>
    </section>

    <section>
      <h2>Information handled by this site</h2>
      <p>This site does not offer Discoflare accounts, advertising, or behavioural analytics. Your browser may save a local light or dark theme preference.</p>
      <p>Like most hosted websites, the infrastructure serving this site may process basic request data such as your IP address, browser type, requested URL, and time of access for security, reliability, and delivery.</p>
    </section>

    <section>
      <h2>Cloudflare installer</h2>
      <p>When you connect Cloudflare, discoflare.com temporarily keeps the OAuth access token in an encrypted, HTTP-only session cookie. The bootstrap uses it to list available accounts and create or repair only the account-local Discoflare Admin Worker. The token is not stored in a Discoflare database and the session expires after one hour.</p>
      <p>Managed Setup stores the returned renewable OAuth credential as encrypted Admin Worker secrets, then removes the OAuth session from discoflare.com. The website never receives an Account Admin Token created and submitted directly on the Admin origin. Later Admin sign-ins use discoflare.com only as the callback for a short-lived identity grant; Admin replaces it with its own encrypted session cookie.</p>
    </section>

    <section>
      <h2>Anonymous heartbeat</h2>
      <p>Guided installations send an authenticated weekly heartbeat containing the random installation ID, Discoflare version, time, and booleans indicating whether supported Cloudflare resource types and optional features are configured. Workspace names, domains, people, messages, files, and usage amounts are never included.</p>
      <p>The workspace owner can disable the heartbeat at any time in Settings → Telemetry. Public figures on discoflare.com are aggregate counts and do not identify an installation.</p>
    </section>

    <section>
      <h2>Links to other services</h2>
      <p>Links to GitHub, Cloudflare, and the Discoflare sandbox take you to services outside this site. Those services receive information under their own terms and privacy policies.</p>
    </section>

    <section>
      <h2>Your self-hosted workspace</h2>
      <p>Discoflare is self-hosted software. The person or organization that deploys a workspace controls its configuration and data. Questions about a particular workspace should go to that workspace operator.</p>
    </section>

    <section>
      <h2>Changes and contact</h2>
      <p>This policy may change as the site evolves. Material updates will appear here with a new effective date. For questions, contact the project maintainer through <a href="https://github.com/vnmtvlv" target="_blank" rel="noopener noreferrer">GitHub</a>.</p>
    </section>
  </LegalPage>
</template>
