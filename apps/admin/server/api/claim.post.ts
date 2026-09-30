import { assertMutation } from '../utils/http'
import { claimOwner } from '../utils/session'

export default defineEventHandler(async (event) => {
  assertMutation(event)
  return claimOwner(event, await readBody(event) ?? {})
})
