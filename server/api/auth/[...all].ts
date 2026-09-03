import { authFromEvent } from '../../utils/better-auth'

export default defineEventHandler((event) => {
  return authFromEvent(event).handler(toWebRequest(event))
})
