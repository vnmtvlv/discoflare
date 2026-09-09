interface WaitForSessionStateOptions {
  refresh: () => Promise<unknown>
  isReady: () => boolean
  wait?: (delayMs: number) => Promise<void>
  attempts?: number
  delayMs?: number
  timeoutMessage: string
}

const defaultWait = (delayMs: number) => new Promise<void>(resolve => setTimeout(resolve, delayMs))

export async function waitForSessionState({
  refresh,
  isReady,
  wait = defaultWait,
  attempts = 45,
  delayMs = 1_000,
  timeoutMessage,
}: WaitForSessionStateOptions) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await refresh()
    if (isReady()) return
    if (attempt < attempts - 1) await wait(delayMs)
  }

  throw new Error(timeoutMessage)
}

export function waitForConnectedSession(options: Omit<WaitForSessionStateOptions, 'isReady' | 'timeoutMessage'> & { isConnected: () => boolean }) {
  return waitForSessionState({
    ...options,
    isReady: options.isConnected,
    timeoutMessage: 'The account token was saved, but the updated Admin Worker is still activating. Reload this page to continue.',
  })
}

export function waitForDisconnectedSession(options: Omit<WaitForSessionStateOptions, 'isReady' | 'timeoutMessage'> & { isConnected: () => boolean }) {
  return waitForSessionState({
    ...options,
    isReady: () => !options.isConnected(),
    timeoutMessage: 'The account token was removed, but the updated Admin Worker is still activating. Reload this page to continue.',
  })
}

export function waitForAdminVersion(options: Omit<WaitForSessionStateOptions, 'isReady' | 'timeoutMessage'> & { currentVersion: () => string | null, targetVersion: string }) {
  return waitForSessionState({
    ...options,
    isReady: () => options.currentVersion() === options.targetVersion,
    timeoutMessage: `Discoflare Admin ${options.targetVersion} was uploaded, but the updated Worker is still activating. Reload this page to continue.`,
  })
}
