<script setup lang="ts">
const route = useRoute()

definePageMeta({ layout: 'docs' })

const path = computed(() => route.path.replace(/\/$/, '') || '/docs')
const { data: page } = await useAsyncData(
  () => `docs-page:${path.value}`,
  () => queryCollection('docs').path(path.value).first(),
  { watch: [path] },
)
const { data: surround } = await useAsyncData(
  () => `docs-surround:${path.value}`,
  () => queryCollectionItemSurroundings('docs', path.value, {
    fields: ['description'],
  }),
  { watch: [path] },
)

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: 'Documentation page not found' })
}

useSeoMeta({
  title: () => `${page.value?.title} · Discoflare Docs`,
  description: () => page.value?.description,
  robots: 'index, follow',
  ogTitle: () => `${page.value?.title} · Discoflare Docs`,
  ogDescription: () => page.value?.description,
  ogType: 'article',
  ogUrl: () => `https://discoflare.com${path.value}`,
  ogSiteName: 'Discoflare',
  ogImage: 'https://discoflare.com/og-image.png',
  twitterCard: 'summary_large_image',
})

useHead({
  link: [{ rel: 'canonical', href: () => `https://discoflare.com${path.value}` }],
})
</script>

<template>
  <UPage
    v-if="page"
    :ui="{
      root: 'flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_13.5rem] lg:gap-10',
      center: 'lg:col-span-1',
      right: 'lg:col-span-1 order-first lg:order-last',
    }"
  >
    <UPageHeader :title="page.title" :description="page.description" />

    <UPageBody>
      <ContentRenderer :value="page" />

      <USeparator />
      <UContentSurround :surround="surround" />
    </UPageBody>

    <template #right>
      <UContentToc
        :links="page.body?.toc?.links || []"
        highlight
        :ui="{ title: 'whitespace-normal text-clip', linkText: 'whitespace-normal text-clip' }"
      />
    </template>
  </UPage>
</template>
