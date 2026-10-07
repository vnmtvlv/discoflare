import { test } from '@e2e-dev/web'
import { credentials, expect } from 'e2e'

test.setup('sign in to the test workspace', { sessions: ['admin'] }, async ({ app, screen, browser, session }) => {
  const admin = credentials.user('admin')
  await app.open('/login')
  // SSR fields are actionable before Vue is ready; hydration can erase early fills.
  await expect.poll(() => browser.evaluate('() => Boolean(window.useNuxtApp && !window.useNuxtApp().isHydrating)'), {
    message: 'login form finished Nuxt hydration before entering credentials',
  }).toBe(true)
  await screen.getByLabel('Email').fill(admin.username)
  await screen.getByLabel('Password').fill(admin.password)
  await screen.getByRole('button', 'Sign in').tap()
  await expect(browser).toHaveURL(/\/channels(?:\/|$)/)
  await expect(screen.getByRole('link', 'general')).toBeVisible()
  await session.save('admin')
})
