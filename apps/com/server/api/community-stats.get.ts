import { communityStats, telemetryDatabase } from '../utils/telemetry-registry'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'public, max-age=300, s-maxage=300')
  try {
    return await communityStats(telemetryDatabase(event))
  }
  catch {
    return communityStats()
  }
})
