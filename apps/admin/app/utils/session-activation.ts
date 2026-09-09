interface WaitForConnectedSessionOptions {
  refresh: () => Promise<unknown>
  isConnected: () => boolean
  wait?: (delayMs: number) => Promise<void>
  attempts?: number
  delayMs?: number
}

const defaultWait = (delayMs: number) => new Promise<void>(resolve => setTimeout(resolve, delayMs))

export async function waitForConnectedSession({
  refresh,
  isConnected,
  wait = defaultWait,
  attempts = 15,
  delayMs = 800,
}: WaitForConnectedSessionOptions) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await refresh()
    if (isConnected()) return
    if (attempt < attempts - 1) await wait(delayMs)
  }

  throw new Error('The account token was saved, but the updated Admin Worker is still activating. Reload this page to continue.')
}
