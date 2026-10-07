import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { verifyDelivery } from './chat-support.js'

test('message reaches another client over WebSocket and persists', { session: 'admin', tags: ['smoke'] }, async ({ app, screen, browser }) => {
  const message = `e2e delivery ${crypto.randomUUID()}`
  await app.open('/channels')
  await screen.getByRole('link', 'general').tap()
  await expect(screen.getByPlaceholder(/Message/)).toBeEnabled()
  await verifyDelivery(browser, message, async () => {
    await screen.getByPlaceholder(/Message/).fill(message)
    await screen.getByRole('button', 'Send message').tap()
    await expect(screen.getByText(message)).toBeVisible()
  })
})
