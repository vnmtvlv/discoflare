<script setup lang="ts">
const siteUrl = 'https://discoflare.com/terms'
const title = 'Terms of use · Discoflare'
const description = 'Terms for using the Discoflare marketing site.'

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
    { rel: 'alternate', type: 'text/markdown', href: 'https://discoflare.com/terms.md' },
  ],
})
</script>

<template>
  <LegalPage
    title="Terms of use"
    description="Terms for using the Discoflare marketing site."
    effective-date="September 3, 2026"
  >
    <section>
      <h2>Using this site</h2>
      <p>You may use this site to learn about Discoflare and access links to its source code, deployment flow, and sandbox. Do not misuse the site, interfere with its operation, or attempt unauthorized access.</p>
    </section>

    <section>
      <h2>Open-source software</h2>
      <p>The Discoflare software is offered separately under the MIT License in its source repository. These terms govern this marketing site and do not replace the software license.</p>
    </section>

    <section>
      <h2>Third-party services</h2>
      <p>Deployment and operation may use services supplied by Cloudflare or others. Their availability, pricing, billing, and terms are controlled by those providers. Discoflare is an independent project and is not endorsed by or affiliated with Cloudflare, Inc.</p>
    </section>

    <section>
      <h2>No warranty</h2>
      <p>This site and its information are provided as available, without warranties of any kind. Features, documentation, links, and deployment requirements may change. You are responsible for evaluating whether the software and third-party services are suitable for your use.</p>
    </section>

    <section>
      <h2>Intellectual property</h2>
      <p>Discoflare names, artwork, and site content remain with their respective owners unless a license says otherwise. Cloudflare and related marks belong to Cloudflare, Inc.</p>
    </section>

    <section>
      <h2>Changes and contact</h2>
      <p>These terms may change as the site evolves. Continued use after an update means the revised terms apply. For questions, contact the project maintainer through <a href="https://github.com/vnmtvlv" target="_blank" rel="noopener noreferrer">GitHub</a>.</p>
    </section>
  </LegalPage>
</template>
