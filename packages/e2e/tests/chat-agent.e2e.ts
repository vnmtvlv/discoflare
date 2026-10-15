import { test } from '@e2e-dev/web'
import { expect, unique } from 'e2e'
import { verifyDelivery } from './chat-support.js'

test('agent sends a message delivered to another client', {
  session: 'admin',
  tags: ['ai'],
  skip: process.env.E2E_AI !== '1' && 'set E2E_AI=1 to enable OpenRouter agent steps',
}, async ({ app, screen, browser, agent }) => {
  const message = `e2e agent ${crypto.randomUUID()}`
  await app.open('/channels')
  await screen.getByRole('link', 'general').tap()
  await expect(screen.getByPlaceholder(/Message/)).toBeEnabled()
  await verifyDelivery(browser, message, async () => {
    await agent.act('Send exactly this message in the current channel: {message}', { params: { message: unique(message) } })
    await expect(screen.getByText(message)).toBeVisible()
  })
})
