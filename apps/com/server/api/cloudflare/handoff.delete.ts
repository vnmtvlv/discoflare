import { assertInstallerMutation } from '../../utils/installer-security'
import { useInstallerSession } from '../../utils/installer-session'

export default defineEventHandler(async (event) => {
  assertInstallerMutation(event)
  const session = await useInstallerSession(event)
  await session.update({ installHandoff: undefined })
  return { ok: true }
})
