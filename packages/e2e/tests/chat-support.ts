import type { Browser } from '@e2e-dev/web'
import { expect } from 'e2e'
import { chromium } from 'playwright-core'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** A second browser context receives the message without navigation or reload. */
export async function verifyDelivery(browser: Browser, message: string, send: () => Promise<void>) {
  const channelUrl = await browser.url()
  const channelId = new URL(channelUrl).pathname.split('/').at(-1)
  const receiverBrowser = await chromium.launch()
  try {
    const context = await receiverBrowser.newContext()
    await context.addCookies(await browser.cookies())
    const receiver = await context.newPage()
    let authenticated = false
    let navigations = 0
    const deliveredIds = new Set<string>()

    receiver.on('framenavigated', (frame) => {
      if (frame === receiver.mainFrame()) navigations++
    })
    receiver.on('websocket', (socket) => {
      if (new URL(socket.url()).pathname !== `/ws/channel/${channelId}`) return
      socket.on('framereceived', ({ payload }) => {
        if (payload === 'pong') return
        let packet: unknown
        try {
          packet = JSON.parse(payload.toString())
        }
        catch {
          return
        }
        if (!isRecord(packet)) return
        if (packet.t === 'hello') authenticated = true
        if (packet.t === 'message' && isRecord(packet.message)
          && packet.message.content === message && typeof packet.message.id === 'string') {
          deliveredIds.add(packet.message.id)
        }
      })
    })

    try {
      await receiver.goto(channelUrl)
      await expect.poll(() => authenticated, { message: 'receiver authenticated its channel WebSocket' }).toBe(true)
      const initialNavigations = navigations
      await send()
      await expect.poll(() => deliveredIds.size, { message: 'receiver got one message over its channel WebSocket' }).toBe(1)
      await expect.poll(() => receiver.getByText(message, { exact: true }).isVisible(), { message: 'receiver rendered the delivered message' }).toBe(true)
      expect(navigations, 'receiver did not navigate or reload to receive the message').toBe(initialNavigations)
      await browser.reload()
      await expect.poll(() => browser.locator('body').getByText(message).count(), { message: 'message persisted once after reloading the sender' }).toBe(1)
    }
    finally {
      for (const id of deliveredIds) {
        const response = await context.request.delete(new URL(`/api/messages/${id}`, channelUrl).toString(), {
          headers: { Origin: new URL(channelUrl).origin },
        })
        expect(response.ok(), 'remove this run\'s test message').toBe(true)
      }
    }
  }
  finally {
    await receiverBrowser.close()
  }
}
